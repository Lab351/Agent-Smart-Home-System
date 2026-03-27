# shared/mqtt/message_handler.py
"""MQTT 消息处理器

负责消息的发送、接收、序列化和验证
"""

import json
import uuid
from typing import Dict, Any, Optional, Callable, Awaitable
from pydantic import ValidationError

from shared.mqtt.topic_manager import TopicManager, TopicType
from shared.models.mqtt_messages import (
    ControlMessage,
    StateMessage,
    DescribeMessage,
    DescriptionMessage,
    HeartbeatMessage,
    GlobalStateMessage,
    PolicyUpdateMessage,
    ArbitrationRequestMessage,
    ArbitrationResponseMessage,
    SystemEventMessage,
)
from shared.utils import utc_now_iso


class MessageHandler:
    """MQTT 消息处理器
    
    负责消息的标准化处理，包括：
    - 自动填充消息头（message_id, timestamp）
    - 消息序列化和反序列化
    - 消息验证
    - 消息回调管理
    
    Examples:
        >>> handler = MessageHandler(agent_id="room-agent-1", topic_manager=tm)
        >>> 
        >>> # 发送控制消息
        >>> await handler.send_control(
        ...     room_id="bedroom",
        ...     target_device="light_1",
        ...     action="on",
        ...     parameters={"brightness": 80}
        ... )
        >>> 
        >>> # 注册消息处理器
        >>> @handler.on_control
        ... async def handle_control(message: ControlMessage):
        ...     print(f"Received control: {message}")
    """
    
    # 消息类型映射
    MESSAGE_TYPE_MAP = {
        TopicType.CONTROL: ControlMessage,
        TopicType.STATE: StateMessage,
        TopicType.DESCRIBE: DescribeMessage,
        TopicType.DESCRIPTION: DescriptionMessage,
        TopicType.HEARTBEAT: HeartbeatMessage,
        TopicType.GLOBAL_STATE: GlobalStateMessage,
        TopicType.POLICY: PolicyUpdateMessage,
        TopicType.ARBITRATION: ArbitrationRequestMessage,
        TopicType.ARBITRATION_RESPONSE: ArbitrationResponseMessage,
        TopicType.EVENTS: SystemEventMessage,
    }
    
    def __init__(
        self, 
        agent_id: str, 
        topic_manager: TopicManager,
        mqtt_publish_func: Callable[[str, str, int], Awaitable[None]]
    ):
        """初始化消息处理器
        
        Args:
            agent_id: Agent ID
            topic_manager: Topic 管理器实例
            mqtt_publish_func: MQTT 发布函数（异步）
        """
        self.agent_id = agent_id
        self.topic_manager = topic_manager
        self.mqtt_publish = mqtt_publish_func
        
        # 消息回调注册表
        self.message_callbacks: Dict[TopicType, Callable] = {}
        
        print(f"[MessageHandler] Initialized for {agent_id}")
    
    def _generate_message_id(self) -> str:
        """生成消息 ID"""
        return str(uuid.uuid4())
    
    def _get_timestamp(self) -> str:
        """获取 ISO 8601 格式的时间戳"""
        return utc_now_iso()
    
    async def send_control(
        self,
        room_id: str,
        target_device: str,
        action: str,
        parameters: Optional[Dict[str, Any]] = None,
        correlation_id: Optional[str] = None,
        target_agent_id: Optional[str] = None
    ) -> str:
        """发送控制消息
        
        Args:
            room_id: 房间 ID
            target_device: 目标设备 ID
            action: 动作
            parameters: 动作参数
            correlation_id: 关联 ID（用于请求追踪）
            target_agent_id: 目标 Agent ID（可选，默认为 room-agent-{room_id}）
            
        Returns:
            消息 ID
            
        Examples:
            >>> await handler.send_control(
            ...     room_id="bedroom",
            ...     target_device="light_1",
            ...     action="on",
            ...     parameters={"brightness": 80}
            ... )
        """
        if target_agent_id is None:
            target_agent_id = f"room-agent-{room_id}"
        
        message_id = self._generate_message_id()
        timestamp = self._get_timestamp()
        
        message = ControlMessage(
            message_id=message_id,
            timestamp=timestamp,
            source_agent=self.agent_id,
            target_device=target_device,
            action=action,
            parameters=parameters or {},
            correlation_id=correlation_id
        )
        
        topic = self.topic_manager.build_control_topic(room_id, target_agent_id)
        qos = self.topic_manager.get_qos_for_topic(TopicType.CONTROL)
        
        await self.mqtt_publish(topic, message.model_dump_json(), qos)
        
        print(f"[MessageHandler] Sent control to {target_device}: {action}")
        return message_id
    
    async def send_state(
        self,
        room_id: str,
        agent_id: str,
        devices: list,
        agent_status: str = "operational"
    ) -> str:
        """发送状态消息
        
        Args:
            room_id: 房间 ID
            agent_id: Agent ID
            devices: 设备状态列表
            agent_status: Agent 状态
            
        Returns:
            消息 ID
        """
        message_id = self._generate_message_id()
        timestamp = self._get_timestamp()
        
        message = StateMessage(
            message_id=message_id,
            timestamp=timestamp,
            agent_id=agent_id,
            devices=devices,
            agent_status=agent_status
        )
        
        topic = self.topic_manager.build_state_topic(room_id, agent_id)
        qos = self.topic_manager.get_qos_for_topic(TopicType.STATE)
        
        await self.mqtt_publish(topic, message.model_dump_json(), qos)
        
        print(f"[MessageHandler] Sent state for {len(devices)} devices")
        return message_id
    
    async def send_describe(
        self,
        room_id: str,
        target_agent_id: str,
        query_type: str = "capabilities",
        correlation_id: Optional[str] = None
    ) -> str:
        """发送能力查询消息
        
        Args:
            room_id: 房间 ID
            target_agent_id: 目标 Agent ID
            query_type: 查询类型
            correlation_id: 关联 ID
            
        Returns:
            消息 ID
        """
        message_id = self._generate_message_id()
        timestamp = self._get_timestamp()
        
        message = DescribeMessage(
            message_id=message_id,
            timestamp=timestamp,
            source_agent=self.agent_id,
            query_type=query_type,
            correlation_id=correlation_id
        )
        
        topic = self.topic_manager.build_describe_topic(room_id, target_agent_id)
        qos = self.topic_manager.get_qos_for_topic(TopicType.DESCRIBE)
        
        await self.mqtt_publish(topic, message.model_dump_json(), qos)
        
        print(f"[MessageHandler] Sent describe request to {target_agent_id}")
        return message_id
    
    async def send_description(
        self,
        room_id: str,
        agent_id: str,
        devices: list,
        capabilities: list,
        correlation_id: Optional[str] = None
    ) -> str:
        """发送能力描述响应
        
        Args:
            room_id: 房间 ID
            agent_id: Agent ID
            devices: 设备能力列表
            capabilities: Agent 能力列表
            correlation_id: 关联 ID
            
        Returns:
            消息 ID
        """
        message_id = self._generate_message_id()
        timestamp = self._get_timestamp()
        
        message = DescriptionMessage(
            message_id=message_id,
            timestamp=timestamp,
            agent_id=agent_id,
            agent_type="room",
            version="1.0.0",
            devices=devices,
            capabilities=capabilities,
            correlation_id=correlation_id
        )
        
        topic = self.topic_manager.build_description_topic(room_id, agent_id)
        qos = self.topic_manager.get_qos_for_topic(TopicType.DESCRIPTION)
        
        await self.mqtt_publish(topic, message.model_dump_json(), qos)
        
        print(f"[MessageHandler] Sent description with {len(devices)} devices")
        return message_id
    
    async def send_heartbeat(
        self,
        room_id: str,
        agent_id: str,
        status: str = "operational",
        uptime_seconds: int = 0,
        metrics: Optional[Dict[str, Any]] = None
    ) -> str:
        """发送心跳消息
        
        Args:
            room_id: 房间 ID
            agent_id: Agent ID
            status: Agent 状态
            uptime_seconds: 运行时间（秒）
            metrics: 系统指标
            
        Returns:
            消息 ID
        """
        message_id = self._generate_message_id()
        timestamp = self._get_timestamp()
        
        from shared.models.mqtt_messages import SystemMetrics
        
        message = HeartbeatMessage(
            message_id=message_id,
            timestamp=timestamp,
            agent_id=agent_id,
            status=status,
            uptime_seconds=uptime_seconds,
            metrics=SystemMetrics(**(metrics or {}))
        )
        
        topic = self.topic_manager.build_heartbeat_topic(room_id, agent_id)
        qos = self.topic_manager.get_qos_for_topic(TopicType.HEARTBEAT)
        
        await self.mqtt_publish(topic, message.model_dump_json(), qos)
        
        print(f"[MessageHandler] Sent heartbeat: {status}")
        return message_id
    
    async def send_global_state(
        self,
        home_mode: str,
        active_users: list,
        risk_level: str = "normal",
        temporal_context: Optional[Dict[str, str]] = None
    ) -> str:
        """发送全局状态消息
        
        Args:
            home_mode: 家庭模式
            active_users: 活跃用户列表
            risk_level: 风险等级
            temporal_context: 时间上下文
            
        Returns:
            消息 ID
        """
        message_id = self._generate_message_id()
        timestamp = self._get_timestamp()
        
        message = GlobalStateMessage(
            message_id=message_id,
            timestamp=timestamp,
            home_mode=home_mode,
            active_users=active_users,
            risk_level=risk_level,
            temporal_context=temporal_context
        )
        
        topic = self.topic_manager.build_global_state_topic()
        qos = self.topic_manager.get_qos_for_topic(TopicType.GLOBAL_STATE)
        
        await self.mqtt_publish(topic, message.model_dump_json(), qos)
        
        print(f"[MessageHandler] Sent global state: {home_mode}")
        return message_id
    
    async def send_arbitration_request(
        self,
        requesting_agent: str,
        conflict_type: str,
        intent: Dict[str, Any],
        conflicting_agents: Optional[list] = None,
        context: Optional[Dict[str, Any]] = None,
        correlation_id: Optional[str] = None
    ) -> str:
        """发送仲裁请求
        
        Args:
            requesting_agent: 请求方 Agent ID
            conflict_type: 冲突类型
            intent: 用户意图
            conflicting_agents: 冲突的 Agent 列表
            context: 上下文信息
            correlation_id: 关联 ID
            
        Returns:
            消息 ID
        """
        message_id = self._generate_message_id()
        timestamp = self._get_timestamp()
        
        message = ArbitrationRequestMessage(
            message_id=message_id,
            timestamp=timestamp,
            requesting_agent=requesting_agent,
            conflict_type=conflict_type,
            intent=intent,
            conflicting_agents=conflicting_agents or [],
            context=context or {},
            correlation_id=correlation_id
        )
        
        topic = self.topic_manager.build_arbitration_topic()
        qos = self.topic_manager.get_qos_for_topic(TopicType.ARBITRATION)
        
        await self.mqtt_publish(topic, message.model_dump_json(), qos)
        
        print(f"[MessageHandler] Sent arbitration request: {conflict_type}")
        return message_id
    
    async def send_arbitration_response(
        self,
        request_id: str,
        decision: str,
        reason: str,
        suggestion: Optional[str] = None,
        modified_action: Optional[Dict[str, Any]] = None
    ) -> str:
        """发送仲裁响应
        
        Args:
            request_id: 原始请求 ID
            decision: 决策
            reason: 原因
            suggestion: 建议
            modified_action: 修改后的动作
            
        Returns:
            消息 ID
        """
        message_id = self._generate_message_id()
        timestamp = self._get_timestamp()
        
        message = ArbitrationResponseMessage(
            message_id=message_id,
            timestamp=timestamp,
            request_id=request_id,
            decision=decision,
            reason=reason,
            suggestion=suggestion,
            modified_action=modified_action
        )
        
        topic = self.topic_manager.build_arbitration_response_topic(request_id)
        qos = self.topic_manager.get_qos_for_topic(TopicType.ARBITRATION_RESPONSE)
        
        await self.mqtt_publish(topic, message.model_dump_json(), qos)
        
        print(f"[MessageHandler] Sent arbitration response: {decision}")
        return message_id
    
    async def send_policy(
        self,
        policy_name: str,
        rules: Dict[str, Any],
        effective_from: Optional[str] = None,
        effective_until: Optional[str] = None
    ) -> str:
        """发送策略更新消息
        
        Args:
            policy_name: 策略名称
            rules: 策略规则
            effective_from: 生效开始时间
            effective_until: 生效结束时间
            
        Returns:
            消息 ID
        """
        message_id = self._generate_message_id()
        timestamp = self._get_timestamp()
        
        message = PolicyUpdateMessage(
            message_id=message_id,
            timestamp=timestamp,
            policy_name=policy_name,
            rules=rules,
            effective_from=effective_from,
            effective_until=effective_until
        )
        
        topic = self.topic_manager.build_policy_topic()
        qos = self.topic_manager.get_qos_for_topic(TopicType.POLICY)
        
        await self.mqtt_publish(topic, message.model_dump_json(), qos)
        
        print(f"[MessageHandler] Sent policy: {policy_name}")
        return message_id
    
    async def send_event(
        self,
        event_type: str,
        event_data: Dict[str, Any]
    ) -> str:
        """发送系统事件消息
        
        Args:
            event_type: 事件类型
            event_data: 事件数据
            
        Returns:
            消息 ID
        """
        message_id = self._generate_message_id()
        timestamp = self._get_timestamp()
        
        message = SystemEventMessage(
            message_id=message_id,
            timestamp=timestamp,
            event_type=event_type,
            event_data=event_data
        )
        
        topic = self.topic_manager.build_events_topic()
        qos = self.topic_manager.get_qos_for_topic(TopicType.EVENTS)
        
        await self.mqtt_publish(topic, message.model_dump_json(), qos)
        
        print(f"[MessageHandler] Sent event: {event_type}")
        return message_id
    
    def deserialize_message(self, topic: str, payload: str) -> Optional[Any]:
        """反序列化消息
        
        Args:
            topic: Topic 字符串
            payload: 消息内容（JSON 字符串）
            
        Returns:
            反序列化后的消息对象，失败返回 None
        """
        try:
            # 解析 topic
            topic_info = self.topic_manager.parse_topic(topic)
            if not topic_info:
                print(f"[MessageHandler] Unknown topic format: {topic}")
                return None
            
            # 获取消息类
            message_class = self.MESSAGE_TYPE_MAP.get(topic_info.topic_type)
            if not message_class:
                print(f"[MessageHandler] Unknown message type: {topic_info.topic_type}")
                return None
            
            # 解析 JSON
            message_dict = json.loads(payload)
            
            # 创建消息对象
            message = message_class(**message_dict)
            
            return message
            
        except json.JSONDecodeError as e:
            print(f"[MessageHandler] JSON decode error: {e}")
            return None
        except ValidationError as e:
            print(f"[MessageHandler] Validation error: {e}")
            return None
        except Exception as e:
            print(f"[MessageHandler] Error deserializing message: {e}")
            return None
    
    def register_callback(self, topic_type: TopicType, callback: Callable):
        """注册消息回调
        
        Args:
            topic_type: Topic 类型
            callback: 回调函数
        """
        self.message_callbacks[topic_type] = callback
        print(f"[MessageHandler] Registered callback for {topic_type.value}")
    
    def on_control(self, callback: Callable):
        """装饰器：注册控制消息回调
        
        Examples:
            >>> @handler.on_control
            ... async def handle_control(message: ControlMessage):
            ...     print(f"Control: {message.action}")
        """
        self.register_callback(TopicType.CONTROL, callback)
        return callback
    
    def on_state(self, callback: Callable):
        """装饰器：注册状态消息回调"""
        self.register_callback(TopicType.STATE, callback)
        return callback
    
    def on_describe(self, callback: Callable):
        """装饰器：注册能力查询回调"""
        self.register_callback(TopicType.DESCRIBE, callback)
        return callback
    
    def on_description(self, callback: Callable):
        """装饰器：注册能力描述回调"""
        self.register_callback(TopicType.DESCRIPTION, callback)
        return callback
    
    def on_heartbeat(self, callback: Callable):
        """装饰器：注册心跳回调"""
        self.register_callback(TopicType.HEARTBEAT, callback)
        return callback
    
    def on_arbitration(self, callback: Callable):
        """装饰器：注册仲裁请求回调"""
        self.register_callback(TopicType.ARBITRATION, callback)
        return callback
    
    def on_arbitration_response(self, callback: Callable):
        """装饰器：注册仲裁响应回调"""
        self.register_callback(TopicType.ARBITRATION_RESPONSE, callback)
        return callback
    
    def on_global_state(self, callback: Callable):
        """装饰器：注册全局状态回调"""
        self.register_callback(TopicType.GLOBAL_STATE, callback)
        return callback
    
    def on_policy(self, callback: Callable):
        """装饰器：注册策略更新回调"""
        self.register_callback(TopicType.POLICY, callback)
        return callback
    
    def on_events(self, callback: Callable):
        """装饰器：注册系统事件回调"""
        self.register_callback(TopicType.EVENTS, callback)
        return callback
