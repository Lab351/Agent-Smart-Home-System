"""Central Agent - 智能家居中央协调智能体

负责：
- 全局状态管理
- 策略规则管理
- 冲突仲裁
- 系统事件广播
"""

import asyncio
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Any, Optional

import paho.mqtt.client as mqtt

from .state_manager import StateManager
from .policy_engine import PolicyEngine
from .arbitrator import Arbitrator
from ..home_assistant_mcp import HomeAssistantMCPClient, ServiceCall
from shared.models.mqtt_messages import (
    GlobalStateMessage,
    PolicyUpdateMessage,
    ArbitrationRequestMessage,
    ArbitrationResponseMessage,
    SystemEventMessage,
    HeartbeatMessage,
    StateMessage,
)


class CentralAgent:
    """Central Agent - 中央协调智能体

    职责：
    - 维护全局状态（家庭模式、用户状态、风险等级）
    - 管理策略规则（模式策略、用户策略）
    - 处理冲突仲裁（多用户冲突、策略违规）
    - 广播系统事件（模式切换、安全事件）
    """

    # MQTT Topics
    TOPIC_HOME_STATE = "home/state"
    TOPIC_HOME_POLICY = "home/policy"
    TOPIC_HOME_ARBITRATION = "home/arbitration"
    TOPIC_HOME_EVENTS = "home/events"
    TOPIC_ARBITRATION_RESPONSE = "home/arbitration/response/{}"
    TOPIC_ROOM_HEARTBEAT = "room/+/agent/+/heartbeat"
    TOPIC_ROOM_STATE = "room/+/agent/+/state"

    def __init__(self, config: Dict[str, Any]):
        """初始化Central Agent

        Args:
            config: 配置字典
                - agent_id: Agent ID
                - home_id: 家庭ID
                - version: Agent版本
                - mqtt: MQTT配置
                - state_persistence: 状态持久化路径（可选）
                - policy_file: 策略配置文件（可选）
        """
        self.config = config
        self.agent_id = config.get("agent_id", "central-agent-1")
        self.home_id = config.get("home_id", "home-001")
        self.version = config.get("version", "1.0.0")

        # MQTT配置
        mqtt_config = config.get("mqtt", {})
        self.brokers = mqtt_config.get("brokers", [])
        self.default_broker = self.brokers[0] if self.brokers else {"host": "localhost", "port": 1883}

        # 初始化核心组件
        self.state_manager = StateManager(
            persistence_path=config.get("state_persistence")
        )
        self.policy_engine = PolicyEngine(
            policy_file=config.get("policy_file")
        )
        self.arbitrator = Arbitrator()

        # 初始化 Home Assistant MCP 客户端
        mcp_config = config.get("mcp", {})
        self.home_assistant_client = None
        if mcp_config.get("server_url"):
            try:
                self.home_assistant_client = HomeAssistantMCPClient(mcp_config)
                print(f"[CentralAgent] Home Assistant MCP client initialized")
            except Exception as e:
                print(f"[CentralAgent] Failed to initialize Home Assistant MCP client: {e}")
        else:
            print(f"[CentralAgent] Home Assistant MCP client disabled (no config)")

        # MQTT客户端
        self.client = None
        self._connected = False
        self._should_reconnect = True

        # 心跳任务
        self._heartbeat_task: Optional[asyncio.Task] = None
        self._heartbeat_interval = config.get("heartbeat", {}).get("interval", 30)

        # 运行状态
        self._running = False

        # Room Agent注册表（用于追踪在线的Room Agent）
        self.room_agents: Dict[str, Dict[str, Any]] = {}

        # 注册状态变化监听器
        self.state_manager.register_listener(self._on_state_change)

        print(f"[CentralAgent] Initialized (id={self.agent_id}, home={self.home_id})")

    async def start(self):
        """启动Central Agent"""
        print("[CentralAgent] Starting Central Agent...")

        # 连接到 Home Assistant MCP Server
        if self.home_assistant_client:
            try:
                mcp_connected = await self.home_assistant_client.connect()
                if mcp_connected:
                    print("[CentralAgent] Home Assistant MCP connected")
                    # 注册状态监听器
                    self.home_assistant_client.register_state_listener(self._on_home_assistant_state_changed)
                else:
                    print("[CentralAgent] Failed to connect to Home Assistant MCP")
            except Exception as e:
                print(f"[CentralAgent] Home Assistant MCP connection error: {e}")

        # 连接到MQTT Broker
        await self._connect_mqtt()

        # 启动心跳任务
        self._heartbeat_task = asyncio.create_task(self._heartbeat_loop())

        # 发布初始状态
        await self._publish_global_state()

        self._running = True
        print("[CentralAgent] Central Agent started")

    async def stop(self):
        """停止Central Agent"""
        print("[CentralAgent] Stopping Central Agent...")
        self._running = False
        self._should_reconnect = False

        # 取消心跳任务
        if self._heartbeat_task:
            self._heartbeat_task.cancel()
            try:
                await self._heartbeat_task
            except asyncio.CancelledError:
                pass

        # 断开 Home Assistant MCP 连接
        if self.home_assistant_client:
            await self.home_assistant_client.disconnect()

        # 断开MQTT连接
        await self._disconnect_mqtt()

        print("[CentralAgent] Central Agent stopped")

    async def _connect_mqtt(self) -> bool:
        """连接到MQTT Broker

        Returns:
            是否成功连接
        """
        try:
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

            # 连接到broker（使用第一个broker）
            broker = self.default_broker
            host = broker.get("host", "localhost")
            port = broker.get("port", 1883)
            username = broker.get("username")
            password = broker.get("password")

            # 设置认证（如果提供）
            if username and password:
                self.client.username_pw_set(username, password)

            print(f"[CentralAgent] Connecting to MQTT broker {host}:{port}...")

            # 连接
            await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: self.client.connect(host, port, keepalive=60)
            )

            # 启动网络循环
            self.client.loop_start()

            # 等待连接
            await asyncio.sleep(1)

            if self._connected:
                print("[CentralAgent] Successfully connected to MQTT broker")
                return True
            else:
                print("[CentralAgent] Failed to connect to MQTT broker")
                return False

        except Exception as e:
            print(f"[CentralAgent] MQTT connection error: {e}")
            return False

    async def _disconnect_mqtt(self):
        """断开MQTT连接"""
        if self.client:
            self.client.loop_stop()
            self.client.disconnect()
        self._connected = False
        print("[CentralAgent] Disconnected from MQTT broker")

    def _on_connect(self, client, userdata, flags, reason_code, properties):
        """MQTT连接回调"""
        self._connected = True
        print(f"[CentralAgent] Connected to MQTT broker (rc={reason_code})")

        # 订阅topics
        # 订阅仲裁请求
        client.subscribe(self.TOPIC_HOME_ARBITRATION, qos=1)
        print(f"[CentralAgent] Subscribed to {self.TOPIC_HOME_ARBITRATION}")

        # 订阅Room Agent心跳
        client.subscribe(self.TOPIC_ROOM_HEARTBEAT, qos=0)
        print(f"[CentralAgent] Subscribed to {self.TOPIC_ROOM_HEARTBEAT}")

        # 订阅Room Agent状态
        client.subscribe(self.TOPIC_ROOM_STATE, qos=0)
        print(f"[CentralAgent] Subscribed to {self.TOPIC_ROOM_STATE}")

    def _on_disconnect(self, *args):
        """MQTT断开回调"""
        self._connected = False
        reason_code = args[2] if len(args) > 2 else 0
        print(f"[CentralAgent] Disconnected from MQTT broker (rc={reason_code})")

        # 如果需要重连
        if self._should_reconnect and reason_code != 0:
            print("[CentralAgent] Scheduling reconnect...")
            asyncio.create_task(self._reconnect())

    def _on_message(self, client, userdata, msg):
        """MQTT消息接收回调"""
        try:
            topic = msg.topic
            payload = msg.payload.decode('utf-8')

            # 路由到对应的处理器
            asyncio.create_task(self._route_message(topic, payload))

        except Exception as e:
            print(f"[CentralAgent] Error processing message: {e}")

    async def _route_message(self, topic: str, payload: str):
        """路由消息到对应的处理器

        Args:
            topic: 消息topic
            payload: 消息内容（JSON字符串）
        """
        try:
            # 解析topic类型
            if topic == self.TOPIC_HOME_ARBITRATION:
                # 仲裁请求
                await self._handle_arbitration_request(payload)
            elif "heartbeat" in topic:
                # Room Agent心跳
                await self._handle_room_heartbeat(payload)
            elif "/state" in topic and topic.startswith("room/"):
                # Room Agent状态
                await self._handle_room_state(payload)
            else:
                print(f"[CentralAgent] Unknown topic: {topic}")

        except Exception as e:
            print(f"[CentralAgent] Error routing message: {e}")

    async def _handle_arbitration_request(self, payload: str):
        """处理仲裁请求

        Args:
            payload: 请求消息（JSON字符串）
        """
        try:
            # 解析请求
            request_data = json.loads(payload)
            request = ArbitrationRequestMessage(**request_data)

            print(f"[CentralAgent] Received arbitration request: {request.message_id}")

            # 执行仲裁
            response = await self.arbitrator.arbitrate(request, self.policy_engine)

            # 发布响应
            response_topic = self.TOPIC_ARBITRATION_RESPONSE.format(request.message_id)
            self.client.publish(response_topic, response.model_dump_json(), qos=1)

            print(f"[CentralAgent] Arbitration response sent to {response_topic}")

        except Exception as e:
            print(f"[CentralAgent] Error handling arbitration request: {e}")

    async def _handle_room_heartbeat(self, payload: str):
        """处理Room Agent心跳

        Args:
            payload: 心跳消息（JSON字符串）
        """
        try:
            heartbeat_data = json.loads(payload)
            heartbeat = HeartbeatMessage(**heartbeat_data)

            # 更新Room Agent状态
            agent_id = heartbeat.agent_id
            self.room_agents[agent_id] = {
                "last_heartbeat": datetime.now(timezone.utc),
                "status": heartbeat.status,
                "uptime": heartbeat.uptime_seconds,
            }

            # 如果是新的Room Agent，发送当前全局状态
            if len(self.room_agents) == 1:  # 第一次收到心跳
                await self._publish_global_state()

        except Exception as e:
            print(f"[CentralAgent] Error handling room heartbeat: {e}")

    async def _handle_room_state(self, payload: str):
        """处理Room Agent状态更新

        Args:
            payload: 状态消息（JSON字符串）
        """
        try:
            state_data = json.loads(payload)
            state = StateMessage(**state_data)

            # 这里可以根据Room Agent的状态更新全局状态
            # 例如：检测到房间有人时，添加活跃用户
            print(f"[CentralAgent] Received state from {state.agent_id}")

        except Exception as e:
            print(f"[CentralAgent] Error handling room state: {e}")

    async def _reconnect(self):
        """重连逻辑"""
        while self._should_reconnect and not self._connected:
            await asyncio.sleep(5)

            if not self._should_reconnect:
                break

            print("[CentralAgent] Attempting to reconnect...")
            await self._connect_mqtt()

    async def _heartbeat_loop(self):
        """心跳循环"""
        while self._running:
            try:
                # 发布心跳（通过home/events）
                heartbeat_event = SystemEventMessage(
                    message_id=f"heartbeat-{int(asyncio.get_event_loop().time())}",
                    timestamp=datetime.now(timezone.utc).isoformat(),
                    event_type="heartbeat",
                    event_data={
                        "agent_id": self.agent_id,
                        "home_id": self.home_id,
                        "active_rooms": len(self.room_agents),
                    }
                )

                if self.client and self._connected:
                    self.client.publish(self.TOPIC_HOME_EVENTS, heartbeat_event.model_dump_json(), qos=0)

                await asyncio.sleep(self._heartbeat_interval)

            except asyncio.CancelledError:
                break
            except Exception as e:
                print(f"[CentralAgent] Heartbeat error: {e}")
                await asyncio.sleep(5)

    async def _publish_global_state(self):
        """发布全局状态"""
        if not (self.client and self._connected):
            return

        # 获取当前状态
        state_message = self.state_manager.to_message()

        # 发布
        self.client.publish(self.TOPIC_HOME_STATE, state_message.model_dump_json(), qos=0)

        print(f"[CentralAgent] Published global state: mode={state_message.home_mode}")

    async def _on_state_change(self, field: str, old_value: Any, new_value: Any):
        """状态变化监听器

        Args:
            field: 变化的字段
            old_value: 旧值
            new_value: 新值
        """
        # 发布全局状态更新
        await self._publish_global_state()

        # 如果是模式切换，发布模式切换事件
        if field == "home_mode":
            await self._publish_mode_switch_event(old_value, new_value)

    async def _publish_mode_switch_event(self, old_mode: str, new_mode: str):
        """发布模式切换事件

        Args:
            old_mode: 旧模式
            new_mode: 新模式
        """
        event = SystemEventMessage(
            message_id=f"mode-switch-{int(asyncio.get_event_loop().time())}",
            timestamp=datetime.now(timezone.utc).isoformat(),
            event_type="mode_switch",
            event_data={
                "from": old_mode,
                "to": new_mode,
                "triggered_by": "central_agent",
            }
        )

        if self.client and self._connected:
            self.client.publish(self.TOPIC_HOME_EVENTS, event.model_dump_json(), qos=1)

        print(f"[CentralAgent] Published mode switch event: {old_mode} -> {new_mode}")

    # ========== 对外接口 ==========

    async def set_home_mode(self, mode: str, triggered_by: str = "manual") -> bool:
        """设置家庭模式

        Args:
            mode: 目标模式
            triggered_by: 触发方式

        Returns:
            是否成功
        """
        return await self.state_manager.set_home_mode(mode, triggered_by)

    async def add_active_user(self, user_id: str):
        """添加活跃用户

        Args:
            user_id: 用户ID
        """
        await self.state_manager.add_active_user(user_id)

    async def remove_active_user(self, user_id: str):
        """移除活跃用户

        Args:
            user_id: 用户ID
        """
        await self.state_manager.remove_active_user(user_id)

    def get_active_users(self) -> List[str]:
        """获取活跃用户列表

        Returns:
            用户ID列表
        """
        return self.state_manager.get_active_users()

    def get_home_mode(self) -> str:
        """获取当前家庭模式

        Returns:
            家庭模式
        """
        return self.state_manager.get_home_mode()

    async def _on_home_assistant_state_changed(self, state):
        """处理 Home Assistant 状态变化

        Args:
            state: EntityState 对象
        """
        print(f"[CentralAgent] Home Assistant state changed: {state.entity_id} -> {state.state}")

        # 可以在这里将 Home Assistant 的状态同步到全局状态
        # 例如：根据 Home Assistant 的传感器更新全局状态

        # 示例：检测到人不在家，切换到 away 模式
        if "presence" in state.entity_id and state.state == "not_home":
            current_mode = self.get_home_mode()
            if current_mode != "away":
                await self.set_home_mode("away", "home_assistant_presence")
                print(f"[CentralAgent] Switched to away mode due to presence sensor")

    async def call_home_assistant_service(self, service: ServiceCall) -> bool:
        """调用 Home Assistant 服务

        Args:
            service: ServiceCall 对象

        Returns:
            是否调用成功
        """
        if not self.home_assistant_client or not self.home_assistant_client.is_connected():
            print("[CentralAgent] Home Assistant MCP not connected")
            return False

        try:
            return await self.home_assistant_client.call_service(service)
        except Exception as e:
            print(f"[CentralAgent] Service call error: {e}")
            return False

    async def get_home_assistant_state(self, entity_id: str):
        """获取 Home Assistant 实体状态

        Args:
            entity_id: 实体ID

        Returns:
            实体状态，如果不存在返回None
        """
        if not self.home_assistant_client or not self.home_assistant_client.is_connected():
            return None

        try:
            return await self.home_assistant_client.get_state(entity_id)
        except Exception as e:
            print(f"[CentralAgent] Get state error: {e}")
            return None
