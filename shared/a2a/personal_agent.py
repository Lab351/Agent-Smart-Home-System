# shared/a2a/personal_agent.py
"""Personal Agent A2A 实现

Personal Agent 的 Agent-to-Agent 通信实现
"""

from typing import Dict, Any, Optional

from shared.a2a.base_agent import BaseA2AAgent
from shared.mqtt.topic_manager import AgentType, TopicType
from shared.models.mqtt_messages import (
    ControlMessage,
    StateMessage,
    DescriptionMessage,
    ArbitrationResponseMessage,
)


class PersonalAgentA2A(BaseA2AAgent):
    """Personal Agent A2A 实现
    
    专注于：
    - 发送控制命令
    - 订阅状态更新
    - 能力发现
    - 空间绑定
    
    Examples:
        >>> personal = PersonalAgentA2A(
        ...     agent_id="personal-agent-user1",
        ...     broker_config={"host": "192.168.1.100", "port": 1883}
        ... )
        >>> 
        >>> async with personal:
        ...     # 发送控制命令
        ...     await personal.send_device_control(
        ...         room_id="bedroom",
        ...         target_device="light_1",
        ...         action="on",
        ...         parameters={"brightness": 80}
        ...     )
        ...     
        ...     # 查询能力
        ...     capabilities = await personal.query_room_capabilities("bedroom")
    """
    
    def _get_agent_type(self) -> AgentType:
        """返回 Personal Agent 类型"""
        return AgentType.PERSONAL
    
    async def _setup_subscriptions(self):
        """设置订阅
        
        Personal Agent 需要订阅：
        - 房间状态更新
        - 能力描述响应
        - 全局状态
        - 策略更新
        - 仲裁响应
        """
        # 订阅所有房间的状态更新（通配符）
        state_topic = self.topic_manager.build_wildcard_topic(
            room_id="+",  # 所有房间
            topic_type=TopicType.STATE
        )
        self.mqtt_client.subscribe(state_topic, qos=0)
        
        # 订阅能力描述响应（通配符）
        description_topic = self.topic_manager.build_wildcard_topic(
            room_id="+",
            topic_type=TopicType.DESCRIPTION
        )
        self.mqtt_client.subscribe(description_topic, qos=1)
        
        # 订阅全局状态
        global_state_topic = self.topic_manager.build_global_state_topic()
        self.mqtt_client.subscribe(global_state_topic, qos=0)
        
        # 订阅策略更新
        policy_topic = self.topic_manager.build_policy_topic()
        self.mqtt_client.subscribe(policy_topic, qos=1)
        
        # 订阅仲裁响应（针对此 Agent）
        arbitration_response_topic = f"home/arbitration/response/+"
        self.mqtt_client.subscribe(arbitration_response_topic, qos=1)
        
        print(f"[PersonalAgentA2A] Subscribed to topics")
    
    async def _handle_message(self, topic: str, message: Any):
        """处理接收到的消息
        
        Args:
            topic: Topic 字符串
            message: 消息对象
        """
        topic_info = self.topic_manager.parse_topic(topic)
        
        if not topic_info:
            return
        
        # 根据消息类型分发
        if topic_info.topic_type == TopicType.STATE:
            await self._handle_state_update(message)
        
        elif topic_info.topic_type == TopicType.DESCRIPTION:
            await self._handle_description(message)
        
        elif topic_info.topic_type == TopicType.GLOBAL_STATE:
            await self._handle_global_state(message)
        
        elif topic_info.topic_type == TopicType.POLICY:
            await self._handle_policy_update(message)
        
        elif topic_info.topic_type == TopicType.ARBITRATION_RESPONSE:
            await self._handle_arbitration_response(message)
    
    async def _handle_state_update(self, message: StateMessage):
        """处理状态更新
        
        Args:
            message: 状态消息
        """
        # 触发事件
        await self.event_dispatcher.emit(
            "room_state_update",
            {
                "agent_id": message.agent_id,
                "devices": message.devices,
                "status": message.agent_status
            }
        )
        
        print(f"[PersonalAgentA2A] Received state from {message.agent_id}")
    
    async def _handle_description(self, message: DescriptionMessage):
        """处理能力描述
        
        Args:
            message: 能力描述消息
        """
        # 这通常会在请求-响应模式中处理
        # 但也可以作为单独的消息接收
        print(f"[PersonalAgentA2A] Received description from {message.agent_id}")
    
    async def _handle_global_state(self, message):
        """处理全局状态更新
        
        Args:
            message: 全局状态消息
        """
        await self.event_dispatcher.emit(
            "global_state_update",
            {
                "home_mode": message.home_mode,
                "active_users": message.active_users,
                "risk_level": message.risk_level
            }
        )
        
        print(f"[PersonalAgentA2A] Global state: {message.home_mode}")
    
    async def _handle_policy_update(self, message):
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
        
        print(f"[PersonalAgentA2A] Policy update: {message.policy_name}")
    
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
        
        print(f"[PersonalAgentA2A] Arbitration response: {message.decision}")
    
    # ==================== Personal Agent 特定方法 ====================
    
    async def send_device_control(
        self,
        room_id: str,
        target_device: str,
        action: str,
        parameters: Optional[Dict[str, Any]] = None,
        target_agent_id: Optional[str] = None
    ) -> str:
        """发送设备控制命令
        
        Args:
            room_id: 房间 ID
            target_device: 目标设备 ID
            action: 动作
            parameters: 参数
            target_agent_id: 目标 Room Agent ID
            
        Returns:
            消息 ID
            
        Examples:
            >>> await personal.send_device_control(
            ...     room_id="bedroom",
            ...     target_device="light_1",
            ...     action="on",
            ...     parameters={"brightness": 80}
            ... )
        """
        return await self.send_control(
            room_id=room_id,
            target_device=target_device,
            action=action,
            parameters=parameters,
            target_agent_id=target_agent_id
        )
    
    async def query_room_capabilities(
        self,
        room_id: str,
        target_agent_id: Optional[str] = None,
        timeout: float = 5.0
    ) -> DescriptionMessage:
        """查询房间能力
        
        Args:
            room_id: 房间 ID
            target_agent_id: 目标 Room Agent ID
            timeout: 超时时间
            
        Returns:
            能力描述消息
            
        Examples:
            >>> capabilities = await personal.query_room_capabilities("bedroom")
            >>> for device in capabilities.devices:
            ...     print(f"Device: {device.name}, Actions: {device.actions}")
        """
        if target_agent_id is None:
            target_agent_id = f"room-agent-{room_id}"
        
        return await self.request_describe(room_id, target_agent_id, timeout)
    
    def on_room_state_update(self, callback):
        """注册房间状态更新回调
        
        Args:
            callback: 回调函数
            
        Examples:
            >>> @personal.on_room_state_update
            ... async def handle_state(data):
            ...     print(f"Room state: {data}")
        """
        return self.on("room_state_update", callback)
    
    def on_global_state_update(self, callback):
        """注册全局状态更新回调"""
        return self.on("global_state_update", callback)
    
    def on_policy_update(self, callback):
        """注册策略更新回调"""
        return self.on("policy_update", callback)
    
    def on_arbitration_response(self, callback):
        """注册仲裁响应回调"""
        return self.on("arbitration_response", callback)