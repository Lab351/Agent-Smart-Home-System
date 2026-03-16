# shared/a2a/central_agent.py
"""Central Agent A2A 实现

Central Agent 的 Agent-to-Agent 通信实现
"""

from typing import Dict, Any, Optional, List

from shared.a2a.base_agent import BaseA2AAgent
from shared.mqtt.topic_manager import AgentType, TopicType
from shared.models.mqtt_messages import (
    ArbitrationRequestMessage,
    ArbitrationResponseMessage,
)


class CentralAgentA2A(BaseA2AAgent):
    """Central Agent A2A 实现
    
    专注于：
    - 全局状态管理
    - 策略发布
    - 冲突仲裁
    - 系统事件发布
    
    Examples:
        >>> central = CentralAgentA2A(
        ...     agent_id="central-agent",
        ...     broker_config={"host": "192.168.1.100", "port": 1883}
        ... )
        >>> 
        >>> async with central:
        ...     # 发布全局状态
        ...     await central.publish_global_state(
        ...         home_mode="home",
        ...         active_users=["user1", "user2"]
        ...     )
        ...     
        ...     # 注册仲裁回调
        ...     @central.on_arbitration_request
        ...     async def handle_arbitration(request: ArbitrationRequestMessage):
        ...         # 做出决策
        ...         decision = await make_decision(request)
        ...         # 发送响应
        ...         await central.send_arbitration_response(
        ...             request_id=request.correlation_id,
        ...             decision=decision
        ...         )
    """
    
    def __init__(
        self,
        agent_id: str,
        broker_config: Dict[str, Any],
    ):
        """初始化 Central Agent A2A
        
        Args:
            agent_id: Agent ID
            broker_config: MQTT Broker 配置
        """
        super().__init__(agent_id, broker_config, room_id=None)
        
        # 全局状态
        self.home_mode = "home"
        self.active_users: List[str] = []
        self.risk_level = "normal"
    
    def _get_agent_type(self) -> AgentType:
        """返回 Central Agent 类型"""
        return AgentType.CENTRAL
    
    async def _setup_subscriptions(self):
        """设置订阅
        
        Central Agent 需要订阅：
        - 所有房间的状态更新
        - 仲裁请求
        - 心跳
        """
        # 订阅所有房间的状态更新
        state_topic = f"room/+/agent/+/state"
        self.mqtt_client.subscribe(state_topic, qos=0)
        
        # 订阅所有房间的心跳
        heartbeat_topic = f"room/+/agent/+/heartbeat"
        self.mqtt_client.subscribe(heartbeat_topic, qos=0)
        
        # 订阅仲裁请求
        arbitration_topic = self.topic_manager.build_arbitration_topic()
        self.mqtt_client.subscribe(arbitration_topic, qos=1)
        
        print(f"[CentralAgentA2A] Subscribed to topics")
    
    async def _handle_message(self, topic: str, message: Any):
        """处理接收到的消息
        
        Args:
            topic: Topic 字符串
            message: 消息对象
        """
        topic_info = self.topic_manager.parse_topic(topic)
        
        if not topic_info:
            return
        
        if topic_info.topic_type == TopicType.STATE:
            await self._handle_room_state(message, topic_info)
        
        elif topic_info.topic_type == TopicType.HEARTBEAT:
            await self._handle_room_heartbeat(message, topic_info)
        
        elif topic_info.topic_type == TopicType.ARBITRATION:
            await self._handle_arbitration_request(message)
    
    async def _handle_room_state(self, message, topic_info):
        """处理房间状态更新
        
        Args:
            message: 状态消息
            topic_info: Topic 信息
        """
        # 触发事件
        await self.event_dispatcher.emit(
            "room_state_update",
            {
                "room_id": topic_info.room_id,
                "agent_id": topic_info.agent_id,
                "devices": message.devices,
                "status": message.agent_status
            }
        )
        
        print(f"[CentralAgentA2A] Room {topic_info.room_id} state update")
    
    async def _handle_room_heartbeat(self, message, topic_info):
        """处理房间心跳
        
        Args:
            message: 心跳消息
            topic_info: Topic 信息
        """
        # 触发事件
        await self.event_dispatcher.emit(
            "room_heartbeat",
            {
                "room_id": topic_info.room_id,
                "agent_id": topic_info.agent_id,
                "status": message.status,
                "uptime": message.uptime_seconds,
                "metrics": message.metrics
            }
        )
        
        # 可以在这里监控房间 Agent 的健康状态
    
    async def _handle_arbitration_request(self, message: ArbitrationRequestMessage):
        """处理仲裁请求
        
        Args:
            message: 仲裁请求消息
        """
        # 触发仲裁事件
        await self.event_dispatcher.emit(
            "arbitration_request",
            {
                "request_id": message.correlation_id,
                "requesting_agent": message.requesting_agent,
                "conflict_type": message.conflict_type,
                "intent": message.intent,
                "context": message.context
            }
        )
        
        print(f"[CentralAgentA2A] Arbitration request from {message.requesting_agent}")
    
    # ==================== Central Agent 特定方法 ====================
    
    async def publish_global_state(
        self,
        home_mode: Optional[str] = None,
        active_users: Optional[List[str]] = None,
        risk_level: Optional[str] = None,
        temporal_context: Optional[Dict[str, str]] = None
    ):
        """发布全局状态
        
        Args:
            home_mode: 家庭模式
            active_users: 活跃用户列表
            risk_level: 风险等级
            temporal_context: 时间上下文
            
        Examples:
            >>> await central.publish_global_state(
            ...     home_mode="sleep",
            ...     active_users=["user1"]
            ... )
        """
        # 更新本地状态
        if home_mode:
            self.home_mode = home_mode
        if active_users is not None:
            self.active_users = active_users
        if risk_level:
            self.risk_level = risk_level
        
        # 发布消息
        await self.message_handler.send_global_state(
            home_mode=self.home_mode,
            active_users=self.active_users,
            risk_level=self.risk_level,
            temporal_context=temporal_context
        )
    
    async def publish_policy(
        self,
        policy_name: str,
        rules: Dict[str, Any],
        effective_from: Optional[str] = None,
        effective_until: Optional[str] = None
    ):
        """发布策略更新
        
        Args:
            policy_name: 策略名称
            rules: 策略规则
            effective_from: 生效开始时间
            effective_until: 生效结束时间
            
        Examples:
            >>> await central.publish_policy(
            ...     policy_name="sleep_mode",
            ...     rules={
            ...         "light_max": "low",
            ...         "noise_max": "minimum"
            ...     }
            ... )
        """
        await self.message_handler.send_policy(
            policy_name=policy_name,
            rules=rules,
            effective_from=effective_from,
            effective_until=effective_until
        )
    
    async def send_arbitration_response(
        self,
        request_id: str,
        decision: str,
        reason: str,
        suggestion: Optional[str] = None,
        modified_action: Optional[Dict[str, Any]] = None
    ):
        """发送仲裁响应
        
        Args:
            request_id: 请求 ID
            decision: 决策 (accept/reject/partial_accept/defer)
            reason: 原因
            suggestion: 建议
            modified_action: 修改后的动作
            
        Examples:
            >>> await central.send_arbitration_response(
            ...     request_id="req-123",
            ...     decision="partial_accept",
            ...     reason="sleep_mode_active",
            ...     modified_action={"brightness": 20}
            ... )
        """
        await self.message_handler.send_arbitration_response(
            request_id=request_id,
            decision=decision,
            reason=reason,
            suggestion=suggestion,
            modified_action=modified_action
        )
    
    async def publish_system_event(
        self,
        event_type: str,
        event_data: Dict[str, Any]
    ):
        """发布系统事件
        
        Args:
            event_type: 事件类型
            event_data: 事件数据
            
        Examples:
            >>> await central.publish_system_event(
            ...     event_type="mode_switch",
            ...     event_data={
            ...         "from_mode": "home",
            ...         "to_mode": "sleep"
            ...     }
            ... )
        """
        await self.message_handler.send_event(
            event_type=event_type,
            event_data=event_data
        )
    
    # ==================== 事件便捷方法 ====================
    
    def on_arbitration_request(self, callback):
        """注册仲裁请求回调
        
        Args:
            callback: 回调函数
            
        Examples:
            >>> @central.on_arbitration_request
            ... async def handle_arbitration(data):
            ...     request_id = data['request_id']
            ...     # 做出决策
            ...     decision = "accept"
            ...     # 发送响应
            ...     await central.send_arbitration_response(
            ...         request_id=request_id,
            ...         decision=decision,
            ...         reason="approved"
            ...     )
        """
        return self.on("arbitration_request", callback)
    
    def on_room_state_update(self, callback):
        """注册房间状态更新回调"""
        return self.on("room_state_update", callback)
    
    def on_room_heartbeat(self, callback):
        """注册房间心跳回调"""
        return self.on("room_heartbeat", callback)