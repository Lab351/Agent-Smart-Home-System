# shared/a2a/room_agent.py
"""Room Agent A2A 实现

Room Agent 的 Agent-to-Agent 通信实现
"""

import asyncio
import psutil
from typing import Any, Dict, List, Optional

from shared.a2a.base_agent import BaseA2AAgent
from shared.mqtt.topic_manager import AgentType, TopicType
from shared.models.mqtt_messages import (
    ArbitrationResponseMessage,
    ControlMessage,
    DescribeMessage,
    DeviceCapability,
    DeviceState,
    PolicyUpdateMessage,
)


class RoomAgentA2A(BaseA2AAgent):
    """Room Agent A2A 实现
    
    专注于：
    - 处理控制命令
    - 发布状态更新
    - 发布心跳
    - 管理设备能力
    - 冲突仲裁请求
    
    Examples:
        >>> room = RoomAgentA2A(
        ...     agent_id="room-agent-bedroom",
        ...     room_id="bedroom_01",
        ...     broker_config={"host": "192.168.1.100", "port": 1883}
        ... )
        >>> 
        >>> # 设置设备能力
        >>> room.set_devices([
        ...     DeviceCapability(
        ...         id="light_1",
        ...         name="主灯",
        ...         type="light",
        ...         actions=["on", "off", "set_brightness"]
        ...     )
        ... ])
        >>> 
        >>> async with room:
        ...     # 注册控制回调
        ...     @room.on_control
        ...     async def handle_control(message: ControlMessage):
        ...         # 执行设备控制
        ...         await execute_device_control(message)
        ...         # 发布状态更新
        ...         await room.publish_state()
    """
    
    def __init__(
        self,
        agent_id: str,
        room_id: str,
        broker_config: Dict[str, Any],
    ):
        """初始化 Room Agent A2A
        
        Args:
            agent_id: Agent ID
            room_id: 房间 ID
            broker_config: MQTT Broker 配置
        """
        super().__init__(agent_id, broker_config, room_id)
        
        # 设备能力
        self.devices: List[DeviceCapability] = []
        
        # Agent 能力
        self.capabilities: List[str] = []
        
        # 当前状态
        self.current_mode = "idle"
        self.agent_status = "operational"
    
    def _get_agent_type(self) -> AgentType:
        """返回 Room Agent 类型"""
        return AgentType.ROOM
    
    async def _setup_subscriptions(self):
        """设置订阅
        
        Room Agent 需要订阅：
        - 控制命令
        - 能力查询
        - 策略更新
        """
        # 订阅控制命令
        control_topic = self.topic_manager.build_control_topic(self.room_id, self.agent_id)
        self.mqtt_client.subscribe(control_topic, qos=1)
        
        # 订阅能力查询
        describe_topic = self.topic_manager.build_describe_topic(self.room_id, self.agent_id)
        self.mqtt_client.subscribe(describe_topic, qos=1)
        
        # 订阅策略更新
        policy_topic = self.topic_manager.build_policy_topic()
        self.mqtt_client.subscribe(policy_topic, qos=1)
        
        # 订阅仲裁响应
        arbitration_response_topic = f"home/arbitration/response/+"
        self.mqtt_client.subscribe(arbitration_response_topic, qos=1)
        
        print(f"[RoomAgentA2A] Subscribed to topics for room {self.room_id}")
    
    async def _handle_message(self, topic: str, message: Any):
        """处理接收到的消息
        
        Args:
            topic: Topic 字符串
            message: 消息对象
        """
        topic_info = self.topic_manager.parse_topic(topic)
        
        if not topic_info:
            return
        
        if topic_info.topic_type == TopicType.CONTROL:
            await self._handle_control(message)
        
        elif topic_info.topic_type == TopicType.DESCRIBE:
            await self._handle_describe(message)
        
        elif topic_info.topic_type == TopicType.POLICY:
            await self._handle_policy_update(message)
        
        elif topic_info.topic_type == TopicType.ARBITRATION_RESPONSE:
            await self._handle_arbitration_response(message)
    
    async def _handle_control(self, message: ControlMessage):
        """处理控制命令
        
        Args:
            message: 控制消息
        """
        # 触发控制事件
        await self.event_dispatcher.emit(
            "control_request",
            {
                "target_device": message.target_device,
                "action": message.action,
                "parameters": message.parameters,
                "source_agent": message.source_agent,
                "correlation_id": message.correlation_id
            }
        )
        
        print(f"[RoomAgentA2A] Control: {message.action} on {message.target_device}")
    
    async def _handle_describe(self, message: DescribeMessage):
        """处理能力查询
        
        Args:
            message: 查询消息
        """
        # 发送能力描述响应
        await self.send_description(correlation_id=message.correlation_id)
        
        print(f"[RoomAgentA2A] Responded to describe request from {message.source_agent}")
    
    async def _handle_policy_update(self, message: PolicyUpdateMessage):
        """处理策略更新
        
        Args:
            message: 策略更新消息
        """
        await self.event_dispatcher.emit(
            "policy_update",
            {
                "policy_name": message.policy_name,
                "rules": message.rules
            }
        )
        
        print(f"[RoomAgentA2A] Policy update: {message.policy_name}")
    
    async def _handle_arbitration_response(self, message: ArbitrationResponseMessage):
        """处理仲裁响应
        
        Args:
            message: 仲裁响应消息
        """
        await self.event_dispatcher.emit(
            "arbitration_response",
            {
                "request_id": message.request_id,
                "decision": message.decision,
                "reason": message.reason,
                "modified_action": message.modified_action
            }
        )
        
        print(f"[RoomAgentA2A] Arbitration response: {message.decision}")

    def _collect_metrics(self) -> Dict[str, float]:
        """在线程池中采集系统指标，避免阻塞事件循环。"""
        return {
            "cpu_usage": psutil.cpu_percent(interval=None),
            "memory_usage": psutil.virtual_memory().percent,
            "active_connections": 0,  # TODO: 实际连接数
        }
    
    async def _send_heartbeat(self):
        """发送心跳消息"""
        metrics = await asyncio.get_running_loop().run_in_executor(
            None,
            self._collect_metrics,
        )
        
        await self.message_handler.send_heartbeat(
            room_id=self.room_id,
            agent_id=self.agent_id,
            status=self.agent_status,
            uptime_seconds=self.get_uptime(),
            metrics=metrics
        )
    
    # ==================== Room Agent 特定方法 ====================
    
    def set_devices(self, devices: List[DeviceCapability]):
        """设置设备能力
        
        Args:
            devices: 设备能力列表
            
        Examples:
            >>> room.set_devices([
            ...     DeviceCapability(
            ...         id="light_1",
            ...         name="主灯",
            ...         type="light",
            ...         actions=["on", "off", "set_brightness"]
            ...     )
            ... ])
        """
        self.devices = devices
        print(f"[RoomAgentA2A] Set {len(devices)} devices")
    
    def set_capabilities(self, capabilities: List[str]):
        """设置 Agent 能力
        
        Args:
            capabilities: 能力列表
        """
        self.capabilities = capabilities
        print(f"[RoomAgentA2A] Set capabilities: {capabilities}")
    
    async def publish_state(self, devices: Optional[List[DeviceState]] = None):
        """发布状态更新
        
        Args:
            devices: 设备状态列表（可选）
            
        Examples:
            >>> await room.publish_state([
            ...     DeviceState(
            ...         device_id="light_1",
            ...         state="on",
            ...         attributes={"brightness": 80}
            ...     )
            ... ])
        """
        await self.message_handler.send_state(
            room_id=self.room_id,
            agent_id=self.agent_id,
            devices=devices or [],
            agent_status=self.agent_status
        )
    
    async def send_description(
        self,
        correlation_id: Optional[str] = None
    ):
        """发送能力描述
        
        Args:
            correlation_id: 关联 ID
        """
        await self.message_handler.send_description(
            room_id=self.room_id,
            agent_id=self.agent_id,
            devices=self.devices,
            capabilities=self.capabilities,
            correlation_id=correlation_id
        )
    
    async def request_arbitration(
        self,
        conflict_type: str,
        intent: Dict[str, Any],
        conflicting_agents: Optional[List[str]] = None,
        context: Optional[Dict[str, Any]] = None,
        timeout: float = 5.0
    ):
        """请求仲裁
        
        Args:
            conflict_type: 冲突类型
            intent: 用户意图
            conflicting_agents: 冲突的 Agent 列表
            context: 上下文信息
            timeout: 超时时间
            
        Returns:
            仲裁响应
            
        Examples:
            >>> response = await room.request_arbitration(
            ...     conflict_type="multi_user_intent",
            ...     intent={"target_device": "light_1", "action": "on"},
            ...     context={"current_mode": "sleep"}
            ... )
        """
        correlation_id = self.request_response_manager.generate_correlation_id()
        response_topic = f"home/arbitration/response/{correlation_id}"

        self.request_response_manager.create_request(
            correlation_id=correlation_id,
            topic=response_topic,
            message={"conflict_type": conflict_type},
            timeout=timeout,
        )

        try:
            await self.message_handler.send_arbitration_request(
                requesting_agent=self.agent_id,
                conflict_type=conflict_type,
                intent=intent,
                conflicting_agents=conflicting_agents,
                context=context,
                correlation_id=correlation_id
            )

            return await self.request_response_manager.wait_for_response(
                correlation_id,
                timeout=timeout,
            )
        except Exception:
            self.request_response_manager.cancel_request(correlation_id, "Arbitration request failed")
            raise
    
    # ==================== 事件便捷方法 ====================
    
    def on_control(self, callback):
        """注册控制命令回调
        
        Args:
            callback: 回调函数
            
        Examples:
            >>> @room.on_control
            ... async def handle_control(data):
            ...     device = data['target_device']
            ...     action = data['action']
            ...     # 执行控制
            ...     await execute_control(device, action)
        """
        return self.on("control_request", callback)
    
    def on_policy_update(self, callback):
        """注册策略更新回调"""
        return self.on("policy_update", callback)
    
    def on_arbitration_response(self, callback):
        """注册仲裁响应回调"""
        return self.on("arbitration_response", callback)
