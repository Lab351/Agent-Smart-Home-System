# shared/models/mqtt_messages.py
"""MQTT消息格式定义

符合docs/communication.md规范的消息格式
"""
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from datetime import datetime


class ControlMessage(BaseModel):
    """控制消息格式

    Topic: room/{room_id}/agent/{agent_id}/control
    QoS: 1
    """
    message_id: str = Field(..., description="消息唯一标识符")
    timestamp: str = Field(..., description="ISO 8601格式时间戳")
    source_agent: str = Field(..., description="发送方Agent ID")
    target_device: str = Field(..., description="目标设备ID")
    action: str = Field(..., description="要执行的动作")
    parameters: Dict[str, Any] = Field(default_factory=dict, description="动作参数")
    correlation_id: Optional[str] = Field(None, description="关联ID（用于请求追踪）")


class DeviceState(BaseModel):
    """设备状态"""
    device_id: str
    state: str
    attributes: Dict[str, Any] = Field(default_factory=dict)


class StateMessage(BaseModel):
    """状态消息格式

    Topic: room/{room_id}/agent/{agent_id}/state
    QoS: 0
    """
    message_id: str = Field(..., description="消息唯一标识符")
    timestamp: str = Field(..., description="ISO 8601格式时间戳")
    agent_id: str = Field(..., description="Agent ID")
    devices: List[DeviceState] = Field(default_factory=list, description="设备状态列表")
    agent_status: str = Field(default="operational", description="Agent状态")


class DescribeMessage(BaseModel):
    """能力查询消息

    Topic: room/{room_id}/agent/{agent_id}/describe
    QoS: 1
    """
    message_id: str = Field(..., description="消息唯一标识符")
    timestamp: str = Field(..., description="ISO 8601格式时间戳")
    source_agent: str = Field(..., description="查询方Agent ID")
    query_type: str = Field(default="capabilities", description="查询类型")
    correlation_id: Optional[str] = Field(None, description="关联ID（用于请求追踪）")


class DeviceCapability(BaseModel):
    """设备能力描述"""
    id: str
    name: str
    type: str
    actions: List[str]
    state_attributes: List[str] = Field(default_factory=list)


class DescriptionMessage(BaseModel):
    """能力描述响应

    Topic: room/{room_id}/agent/{agent_id}/description
    QoS: 1
    """
    message_id: str = Field(..., description="消息唯一标识符")
    timestamp: str = Field(..., description="ISO 8601格式时间戳")
    agent_id: str = Field(..., description="Agent ID")
    agent_type: str = Field(default="room", description="Agent类型")
    version: str = Field(..., description="Agent版本")
    devices: List[DeviceCapability] = Field(default_factory=list, description="设备能力列表")
    capabilities: List[str] = Field(default_factory=list, description="Agent能力列表")
    correlation_id: Optional[str] = Field(None, description="关联ID（用于请求追踪）")


class SystemMetrics(BaseModel):
    """系统指标"""
    cpu_usage: float = 0.0
    memory_usage: float = 0.0
    active_connections: int = 0


class HeartbeatMessage(BaseModel):
    """心跳消息

    Topic: room/{room_id}/agent/{agent_id}/heartbeat
    QoS: 0
    """
    message_id: str = Field(..., description="消息唯一标识符")
    timestamp: str = Field(..., description="ISO 8601格式时间戳")
    agent_id: str = Field(..., description="Agent ID")
    status: str = Field(default="operational", description="Agent状态")
    uptime_seconds: int = Field(..., description="运行时间（秒）")
    metrics: SystemMetrics = Field(default_factory=SystemMetrics, description="系统指标")


# ==================== Central Agent 专用消息 ====================

class GlobalStateMessage(BaseModel):
    """全局状态消息

    Topic: home/state
    QoS: 0
    """
    message_id: str = Field(..., description="消息唯一标识符")
    timestamp: str = Field(..., description="ISO 8601格式时间戳")
    home_mode: str = Field(..., description="家庭模式: home/away/sleep/vacation")
    active_users: List[str] = Field(default_factory=list, description="当前活跃用户列表")
    risk_level: str = Field(default="normal", description="系统风险状态: normal/warning/critical")
    temporal_context: Optional[Dict[str, str]] = Field(None, description="时间上下文")


class PolicyUpdateMessage(BaseModel):
    """策略更新消息

    Topic: home/policy
    QoS: 1
    """
    message_id: str = Field(..., description="消息唯一标识符")
    timestamp: str = Field(..., description="ISO 8601格式时间戳")
    policy_name: str = Field(..., description="策略名称")
    rules: Dict[str, Any] = Field(..., description="策略规则")
    effective_from: Optional[str] = Field(None, description="生效开始时间")
    effective_until: Optional[str] = Field(None, description="生效结束时间")


class ArbitrationRequestMessage(BaseModel):
    """仲裁请求消息

    Topic: home/arbitration
    QoS: 1
    """
    message_id: str = Field(..., description="消息唯一标识符")
    timestamp: str = Field(..., description="ISO 8601格式时间戳")
    requesting_agent: str = Field(..., description="请求仲裁的Agent ID")
    conflicting_agents: List[str] = Field(default_factory=list, description="冲突的Agent列表")
    conflict_type: str = Field(..., description="冲突类型: multi_user_intent/policy_violation/resource_competition")
    intent: Dict[str, Any] = Field(..., description="用户意图")
    context: Dict[str, Any] = Field(default_factory=dict, description="上下文信息")
    correlation_id: Optional[str] = Field(None, description="关联ID（用于请求追踪）")


class ArbitrationResponseMessage(BaseModel):
    """仲裁响应消息

    Topic: home/arbitration/response/{request_id}
    QoS: 1
    """
    message_id: str = Field(..., description="消息唯一标识符")
    timestamp: str = Field(..., description="ISO 8601格式时间戳")
    request_id: str = Field(..., description="原始请求ID")
    decision: str = Field(..., description="仲裁决策: accept/reject/partial_accept/defer")
    reason: str = Field(..., description="决策原因")
    suggestion: Optional[str] = Field(None, description="建议")
    modified_action: Optional[Dict[str, Any]] = Field(None, description="修改后的动作（降级执行）")


class SystemEventMessage(BaseModel):
    """系统事件消息

    Topic: home/events
    QoS: 1
    """
    message_id: str = Field(..., description="消息唯一标识符")
    timestamp: str = Field(..., description="ISO 8601格式时间戳")
    event_type: str = Field(..., description="事件类型: mode_switch/security/anomaly")
    event_data: Dict[str, Any] = Field(..., description="事件数据")
