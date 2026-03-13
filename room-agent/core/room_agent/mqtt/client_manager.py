# core/room_agent/mqtt/client_manager.py
"""MQTT客户端连接管理器

负责连接到外部MQTT broker，管理订阅和发布
"""

import asyncio
import json
import socket
from typing import Dict, Any, Optional, Callable, List
from datetime import datetime

import paho.mqtt.client as mqtt

from core.room_agent.models import (
    ControlMessage,
    StateMessage,
    DescribeMessage,
    DescriptionMessage,
    HeartbeatMessage,
)
import config


class MqttClientManager:
    """MQTT客户端连接管理器

    职责：
    - 连接到外部MQTT broker
    - 管理订阅和发布
    - 处理连接状态和重连
    """

    def __init__(self, room_id: str, agent_id: str, broker_config: dict):
        """初始化MQTT客户端管理器

        Args:
            room_id: 房间ID
            agent_id: Agent ID
            broker_config: Broker配置
                - host: Broker地址
                - port: Broker端口（默认1883）
                - username: 用户名（可选）
                - password: 密码（可选）
        """
        self.room_id = room_id
        self.agent_id = agent_id

        # Broker配置
        self.broker_host = broker_config.get("host", "localhost")
        self.broker_port = broker_config.get("port", 1883)
        self.username = broker_config.get("username")
        self.password = broker_config.get("password")

        # Topic前缀
        self.topic_prefix = f"room/{room_id}"

        # Paho MQTT客户端
        self.client = None
        self._connected = False

        # 消息处理器注册表
        self.message_handlers: Dict[str, Callable] = {}

        # 重连配置
        self._should_reconnect = True
        self._reconnect_delay = 1  # 起始1秒

        # 事件循环和队列（用于跨线程调用）
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._event_queue: Optional[asyncio.Queue] = None
        self._event_processor_task: Optional[asyncio.Task] = None

        print(f"[MqttClientManager] Initialized for {agent_id} (room: {room_id})")

    def _on_connect(self, client, userdata, flags, reason_code, properties):
        """MQTT连接回调"""
        self._connected = True
        self._reconnect_delay = 1  # 重置重连延迟

        print(f"[MqttClientManager] Connected to {self.broker_host}:{self.broker_port}")

        # 订阅自己相关的topics
        self._subscribe_to_topics()

    def _on_disconnect(self, *args):
        """MQTT断开回调"""
        self._connected = False
        # args: (client, userdata, reason_code) 或 (client, userdata, reason_code, properties)
        reason_code = args[2] if len(args) > 2 else 0
        print(f"[MqttClientManager] Disconnected from broker (rc: {reason_code}, type: {type(reason_code).__name__})")

        # 只在异常断开时重连
        if self._should_reconnect and reason_code != 0:
            print(f"[MqttClientManager] Abnormal disconnect, scheduling reconnect in {self._reconnect_delay}s...")
            self._schedule_event('reconnect', {})
        else:
            print(f"[MqttClientManager] Normal disconnect or reconnect disabled")

    def _on_message(self, client, userdata, msg):
        """MQTT消息接收回调"""
        try:
            # 解析消息
            topic = msg.topic
            payload = msg.payload.decode('utf-8')

            print(f"[MqttClientManager] Received message on {topic}")

            # 路由到对应的处理器（通过事件队列）
            self._schedule_event('message', {'topic': topic, 'payload': payload})

        except Exception as e:
            print(f"[MqttClientManager] Error processing message: {e}")

    def _schedule_event(self, event_type: str, event_data: dict):
        """线程安全地调度事件到主事件循环

        从 paho-mqtt 的网络线程回调中调用，将事件放入队列

        Args:
            event_type: 事件类型 ('reconnect', 'message')
            event_data: 事件数据
        """
        if self._event_queue is None or self._loop is None:
            print(f"[MqttClientManager] Event queue not initialized, dropping {event_type} event")
            return

        try:
            asyncio.run_coroutine_threadsafe(
                self._event_queue.put((event_type, event_data)),
                self._loop
            )
        except RuntimeError as e:
            # 事件循环已关闭，记录警告但不崩溃
            print(f"[MqttClientManager] Failed to schedule event (loop closed?): {e}")

    def _debug_connection_state(self):
        """打印连接状态（用于调试）"""
        print(f"[MqttClientManager] Debug State:")
        print(f"  - _connected: {self._connected}")
        print(f"  - _should_reconnect: {self._should_reconnect}")
        print(f"  - client: {self.client is not None}")
        print(f"  - _event_queue: {self._event_queue is not None}")
        print(f"  - _event_processor_task: {self._event_processor_task is not None}")
        print(f"  - _loop: {self._loop is not None}")
        print(f"  - _reconnect_delay: {self._reconnect_delay}")

    async def _process_events(self):
        """处理事件队列中的事件

        在主事件循环中运行，从队列中取出事件并分发到对应的处理器
        """
        try:
            while True:
                event_type, event_data = await self._event_queue.get()

                try:
                    if event_type == 'reconnect':
                        # 重连逻辑
                        # 检查是否已经连接（避免重复重连）
                        if self._connected:
                            print(f"[MqttClientManager] Already connected, skipping reconnect")
                            continue

                        print(f"[MqttClientManager] Waiting {self._reconnect_delay}s before reconnect...")
                        await asyncio.sleep(self._reconnect_delay)

                        # 再次检查（异步延迟期间可能已连接）
                        if self._connected:
                            print(f"[MqttClientManager] Connected during delay, skipping reconnect")
                            continue

                        if self._should_reconnect and not self._connected:
                            print(f"[MqttClientManager] Attempting to reconnect...")
                            success = await self.connect()
                            if success:
                                # 重连成功，重置延迟
                                self._reconnect_delay = 1
                                print(f"[MqttClientManager] Reconnect successful")
                            else:
                                # 重连失败，指数退避
                                self._reconnect_delay = min(self._reconnect_delay * 2, 60)
                                print(f"[MqttClientManager] Reconnect failed, retrying in {self._reconnect_delay}s")

                    elif event_type == 'message':
                        # 消息路由
                        await self._route_message(event_data['topic'], event_data['payload'])

                except Exception as e:
                    print(f"[MqttClientManager] Error processing {event_type} event: {e}")
                finally:
                    self._event_queue.task_done()

        except asyncio.CancelledError:
            print("[MqttClientManager] Event processor cancelled")

    def _subscribe_to_topics(self):
        """订阅相关的topics"""
        # 订阅control topic
        control_topic = f"{self.topic_prefix}/agent/{self.agent_id}/control"
        self.client.subscribe(control_topic, qos=1)
        print(f"[MqttClientManager] Subscribed to {control_topic} (QoS 1)")

        # 订阅describe topic
        describe_topic = f"{self.topic_prefix}/agent/{self.agent_id}/describe"
        self.client.subscribe(describe_topic, qos=1)
        print(f"[MqttClientManager] Subscribed to {describe_topic} (QoS 1)")

    async def _route_message(self, topic: str, payload: str):
        """路由消息到对应的处理器

        Args:
            topic: 消息topic
            payload: 消息内容（JSON字符串）
        """
        try:
            # 解析topic类型
            topic_parts = topic.split('/')
            if len(topic_parts) < 4:
                print(f"[MqttClientManager] Invalid topic format: {topic}")
                return

            topic_type = topic_parts[3]  # control, describe, etc.

            # 解析JSON payload
            message_data = json.loads(payload)

            # 路由到处理器
            if topic_type == "control":
                handler = self.message_handlers.get("control")
                if handler:
                    control_msg = ControlMessage(**message_data)
                    await handler(control_msg)
            elif topic_type == "describe":
                handler = self.message_handlers.get("describe")
                if handler:
                    describe_msg = DescribeMessage(**message_data)
                    await handler(describe_msg)
            else:
                print(f"[MqttClientManager] Unknown topic type: {topic_type}")

        except Exception as e:
            print(f"[MqttClientManager] Error routing message: {e}")

    async def _cleanup_existing_connection(self):
        """清理现有连接资源

        在重连时调用，确保旧的资源被正确释放
        """
        # 停止事件处理器任务
        if self._event_processor_task:
            print(f"[MqttClientManager] Cancelling old event processor task...")
            self._event_processor_task.cancel()
            try:
                await asyncio.wait_for(self._event_processor_task, timeout=2)
            except (asyncio.CancelledError, asyncio.TimeoutError):
                pass

        # 停止旧的 MQTT 客户端
        if self.client:
            print(f"[MqttClientManager] Stopping old MQTT client...")
            try:
                self.client.loop_stop()
                self.client.disconnect()
            except Exception as e:
                print(f"[MqttClientManager] Error stopping old client: {e}")

        # 清理引用
        self._event_queue = None
        self._loop = None
        self._connected = False
        print(f"[MqttClientManager] Cleanup completed")

    async def connect(self) -> bool:
        """连接到MQTT Broker

        Returns:
            bool: 是否成功连接
        """
        try:
            # 检查是否已有连接，先清理
            if self.client or self._event_processor_task:
                print(f"[MqttClientManager] Warning: Existing connection found, cleaning up...")
                await self._cleanup_existing_connection()

            # 创建MQTT客户端
            self.client = mqtt.Client(
                client_id=f"{self.agent_id}",
                protocol=mqtt.MQTTv311,
                callback_api_version=mqtt.CallbackAPIVersion.VERSION2
            )

            # 设置回调
            self.client.on_connect = self._on_connect
            self.client.on_disconnect = self._on_disconnect
            self.client.on_message = self._on_message

            # 设置认证（如果提供）
            if self.username and self.password:
                self.client.username_pw_set(self.username, self.password)

            # 保存事件循环引用并创建事件队列
            self._loop = asyncio.get_event_loop()
            self._event_queue = asyncio.Queue()

            # 连接到broker
            print(f"[MqttClientManager] Connecting to {self.broker_host}:{self.broker_port}...")
            await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: self.client.connect(self.broker_host, self.broker_port, keepalive=60)
            )

            # 启动网络循环
            self.client.loop_start()

            # 等待连接
            await asyncio.sleep(1)

            if self._connected:
                print("[MqttClientManager] Successfully connected")
                # 启动事件处理器任务
                self._event_processor_task = asyncio.create_task(self._process_events())
                return True
            else:
                print("[MqttClientManager] Failed to connect")
                return False

        except Exception as e:
            print(f"[MqttClientManager] Connection error: {e}")
            return False

    async def disconnect(self):
        """断开连接"""
        self._should_reconnect = False

        # 停止事件处理器
        if self._event_processor_task:
            self._event_processor_task.cancel()
            try:
                await self._event_processor_task
            except asyncio.CancelledError:
                pass

        if self.client:
            self.client.loop_stop()
            self.client.disconnect()

        # 清理引用
        self._event_queue = None
        self._loop = None
        self._connected = False
        print("[MqttClientManager] Disconnected")

    async def publish_state(self, state_message: StateMessage):
        """发布状态消息

        Args:
            state_message: 状态消息
        """
        topic = f"{self.topic_prefix}/agent/{self.agent_id}/state"
        payload = state_message.model_dump_json()

        try:
            if self.client and self._connected:
                self.client.publish(topic, payload, qos=0)
                print(f"[MqttClientManager] Published state to {topic}")
        except Exception as e:
            print(f"[MqttClientManager] Failed to publish state: {e}")

    async def publish_description(self, description_message: DescriptionMessage):
        """发布能力描述

        Args:
            description_message: 描述消息
        """
        topic = f"{self.topic_prefix}/agent/{self.agent_id}/description"
        payload = description_message.model_dump_json()

        try:
            if self.client and self._connected:
                self.client.publish(topic, payload, qos=1)
                print(f"[MqttClientManager] Published description to {topic}")
        except Exception as e:
            print(f"[MqttClientManager] Failed to publish description: {e}")

    async def publish_heartbeat(self, heartbeat_message: HeartbeatMessage):
        """发布心跳消息

        Args:
            heartbeat_message: 心跳消息
        """
        topic = f"{self.topic_prefix}/agent/{self.agent_id}/heartbeat"
        payload = heartbeat_message.model_dump_json()

        try:
            if self.client and self._connected:
                self.client.publish(topic, payload, qos=0)
                print(f"[MqttClientManager] Published heartbeat to {topic}")
        except Exception as e:
            print(f"[MqttClientManager] Failed to publish heartbeat: {e}")

    def register_handler(self, message_type: str, handler: Callable):
        """注册消息处理器

        Args:
            message_type: 消息类型（control, describe等）
            handler: 处理器函数（async）
        """
        self.message_handlers[message_type] = handler
        print(f"[MqttClientManager] Registered handler for '{message_type}'")

    @property
    def is_connected(self) -> bool:
        """检查是否已连接"""
        return self._connected
