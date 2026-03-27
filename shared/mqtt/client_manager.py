# shared/mqtt/client_manager.py
"""MQTT客户端连接管理器

负责连接到MQTT broker，管理订阅和发布
可作为 Room Agent 和 Central Agent 的共用组件
"""

import asyncio
import json
from typing import Callable, Dict, Optional, Union

import paho.mqtt.client as mqtt


class MqttClientManager:
    """MQTT客户端连接管理器

    职责：
    - 连接到MQTT broker
    - 管理订阅和发布
    - 处理连接状态和重连
    - 路由消息到处理器
    """

    def __init__(
        self,
        agent_id: str,
        broker_config: dict,
        topic_prefix: str = None,
    ):
        """初始化MQTT客户端管理器

        Args:
            agent_id: Agent ID
            broker_config: Broker配置
                - host: Broker地址
                - port: Broker端口（默认1883）
                - username: 用户名（可选）
                - password: 密码（可选）
            topic_prefix: Topic前缀（如 room/{room_id} 或 home）
        """
        self.agent_id = agent_id
        self.topic_prefix = topic_prefix or f"agent/{agent_id}"

        # Broker配置
        self.broker_host = broker_config.get("host", "localhost")
        self.broker_port = broker_config.get("port", 1883)
        self.username = broker_config.get("username")
        self.password = broker_config.get("password")

        # Paho MQTT客户端
        self.client = None
        self._connected = False
        self._loop: Optional[asyncio.AbstractEventLoop] = None

        # 原始消息回调：handler(topic, payload)
        self.message_handler: Optional[Callable[[str, str], asyncio.Future]] = None

        # 已注册的订阅，用于重连后自动恢复
        self._subscriptions: Dict[str, int] = {}

        # 重连配置
        self._should_reconnect = True
        self._reconnect_delay = 1  # 起始1秒

        print(f"[MqttClientManager] Initialized for {agent_id}")

    def _on_connect(self, client, userdata, flags, reason_code, properties):
        """MQTT连接回调"""
        self._connected = True
        self._reconnect_delay = 1  # 重置重连延迟

        print(f"[MqttClientManager] Connected to {self.broker_host}:{self.broker_port}")

        self._resubscribe_to_topics()

    def _on_disconnect(self, *args):
        """MQTT断开回调"""
        self._connected = False
        reason_code = args[2] if len(args) > 2 else 0
        print(f"[MqttClientManager] Disconnected from broker (rc: {reason_code})")

        # 如果需要重连
        if self._should_reconnect and reason_code != 0:
            print(f"[MqttClientManager] Scheduling reconnect in {self._reconnect_delay}s...")
            self._schedule_coroutine(self._reconnect())

    def _on_message(self, client, userdata, msg):
        """MQTT消息接收回调"""
        try:
            topic = msg.topic
            payload = msg.payload.decode('utf-8')

            print(f"[MqttClientManager] Received message on {topic}")

            self._schedule_coroutine(self._dispatch_message(topic, payload))

        except Exception as e:
            print(f"[MqttClientManager] Error processing message: {e}")

    def _schedule_coroutine(self, coroutine):
        """在线程安全的前提下调度协程到主事件循环。"""
        if self._loop is None or self._loop.is_closed():
            print("[MqttClientManager] Event loop unavailable, dropping scheduled task")
            return

        asyncio.run_coroutine_threadsafe(coroutine, self._loop)

    def _resubscribe_to_topics(self):
        """重连成功后恢复全部订阅。"""
        if not self.client or not self._connected:
            return

        for topic, qos in self._subscriptions.items():
            self.client.subscribe(topic, qos=qos)
            print(f"[MqttClientManager] Resubscribed to {topic} (QoS {qos})")

    async def _dispatch_message(self, topic: str, payload: str):
        """将原始 MQTT 消息转发给上层处理器。"""
        if self.message_handler is None:
            print(f"[MqttClientManager] No message handler registered for {topic}")
            return

        try:
            await self.message_handler(topic, payload)
        except Exception as e:
            print(f"[MqttClientManager] Error dispatching message: {e}")

    async def connect(self) -> bool:
        """连接到MQTT Broker

        Returns:
            bool: 是否成功连接
        """
        try:
            self._loop = asyncio.get_running_loop()

            # 创建MQTT客户端
            self.client = mqtt.Client(
                client_id=self.agent_id,
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

        if self.client:
            self.client.loop_stop()
            self.client.disconnect()

        self._connected = False
        self._loop = None
        print("[MqttClientManager] Disconnected")

    async def _reconnect(self):
        """重连逻辑"""
        while self._should_reconnect and not self._connected:
            await asyncio.sleep(self._reconnect_delay)

            if not self._should_reconnect:
                break

            print(f"[MqttClientManager] Attempting to reconnect...")
            success = await self.connect()

            if not success:
                # 指数退避，最大60秒
                self._reconnect_delay = min(self._reconnect_delay * 2, 60)
                print(f"[MqttClientManager] Reconnect failed, retrying in {self._reconnect_delay}s")

    async def publish(self, topic: str, payload: Union[str, dict], qos: int = 0):
        """发布消息

        Args:
            topic: 消息topic
            payload: 消息内容（字符串或字典）
            qos: QoS等级（0/1）
        """
        try:
            if self.client and self._connected:
                # 如果是字典，转换为JSON
                if isinstance(payload, dict):
                    import json
                    payload = json.dumps(payload)

                self.client.publish(topic, payload, qos=qos)
                print(f"[MqttClientManager] Published to {topic}")
        except Exception as e:
            print(f"[MqttClientManager] Failed to publish: {e}")

    def subscribe(self, topic: str, qos: int = 0):
        """订阅topic

        Args:
            topic: 订阅的topic
            qos: QoS等级
        """
        self._subscriptions[topic] = qos

        try:
            if self.client and self._connected:
                self.client.subscribe(topic, qos=qos)
                print(f"[MqttClientManager] Subscribed to {topic} (QoS {qos})")
        except Exception as e:
            print(f"[MqttClientManager] Failed to subscribe: {e}")

    def set_message_handler(self, handler: Callable[[str, str], asyncio.Future]):
        """注册原始 MQTT 消息处理器。"""
        self.message_handler = handler
        print("[MqttClientManager] Registered raw message handler")

    def register_handler(self, message_type: str, handler: Callable[[str, str], asyncio.Future]):
        """兼容旧接口，统一注册为原始消息处理器。"""
        _ = message_type
        self.set_message_handler(handler)

    @property
    def is_connected(self) -> bool:
        """检查是否已连接"""
        return self._connected
