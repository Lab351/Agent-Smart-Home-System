from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from datetime import datetime
import uuid
from shared.models.agent_card import AgentCard


class A2AMessage(BaseModel):
    """A2A标准消息基类
    
    所有A2A消息都应该继承此类
    """
    message_id: str = Field(default_factory=lambda: str(uuid.uuid4()), description="消息唯一标识符")
    timestamp: str = Field(
        default_factory=lambda: datetime.utcnow().isoformat(),
        description="ISO 8601格式时间戳"
    )
    correlation_id: Optional[str] = Field(None, description="关联ID（用于请求-响应模式）")


class TaskState(str):
    """任务状态"""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELED = "canceled"


class A2ATask(BaseModel):
    """A2A任务（A2A SDK核心概念）
    
    任务是Agent间协作的基本单元
    """
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), description="任务ID")
    status: str = Field(default="pending", description="任务状态: pending/running/completed/failed/canceled")
    message: Optional[A2AMessage] = Field(None, description="任务消息")
    result: Optional[Dict[str, Any]] = Field(None, description="任务结果")
    error: Optional[str] = Field(None, description="错误信息")
    
    created_at: str = Field(
        default_factory=lambda: datetime.utcnow().isoformat(),
        description="创建时间"
    )
    updated_at: str = Field(
        default_factory=lambda: datetime.utcnow().isoformat(),
        description="更新时间"
    )


class ControlMessage(A2AMessage):
    """控制消息（设备控制）
    
    用于控制设备或请求Agent执行某个动作
    """
    source_agent: str = Field(..., description="发送方Agent ID")
    target_device: str = Field(..., description="目标设备ID")
    action: str = Field(..., description="要执行的动作")
    parameters: Dict[str, Any] = Field(default_factory=dict, description="动作参数")
    
    task: Optional[A2ATask] = Field(None, description="关联的A2A任务")
    
    model_config = {
        "json_schema_extra": {
            "example": {
                "message_id": "ctrl-123",
                "timestamp": "2024-01-01T12:00:00",
                "source_agent": "personal-agent-user1",
                "target_device": "light_1",
                "action": "set_brightness",
                "parameters": {"brightness": 80},
                "correlation_id": "req-456"
            }
        }
    }


class DeviceState(BaseModel):
    """设备状态"""
    device_id: str = Field(..., description="设备ID")
    state: str = Field(..., description="设备状态")
    attributes: Dict[str, Any] = Field(default_factory=dict, description="状态属性")


class StateMessage(A2AMessage):
    """状态消息（设备状态更新）
    
    用于通知设备状态变化
    """
    agent_id: str = Field(..., description="Agent ID")
    devices: List[DeviceState] = Field(default_factory=list, description="设备状态列表")
    agent_status: str = Field(default="operational", description="Agent状态")
    
    model_config = {
        "json_schema_extra": {
            "example": {
                "message_id": "state-789",
                "timestamp": "2024-01-01T12:00:00",
                "agent_id": "room-agent-bedroom-01",
                "devices": [
                    {
                        "device_id": "light_1",
                        "state": "on",
                        "attributes": {"brightness": 80, "color_temp": 4000}
                    }
                ],
                "agent_status": "operational"
            }
        }
    }


class DescriptionMessage(A2AMessage):
    """能力描述消息
    
    用于响应能力查询，返回Agent Card
    """
    agent_id: str = Field(..., description="Agent ID")
    agent_card: AgentCard = Field(..., description="Agent Card")
    
    model_config = {
        "json_schema_extra": {
            "example": {
                "message_id": "desc-101",
                "timestamp": "2024-01-01T12:00:00",
                "agent_id": "room-agent-bedroom-01",
                "agent_card": {
                    "id": "room-agent-bedroom-01",
                    "name": "卧室房间代理",
                    "description": "管理卧室智能设备",
                    "version": "1.0.0",
                    "agent_type": "room",
                    "capabilities": ["light_control"]
                }
            }
        }
    }


class SystemMetrics(BaseModel):
    """系统指标"""
    cpu_usage: float = Field(default=0.0, description="CPU使用率")
    memory_usage: float = Field(default=0.0, description="内存使用率")
    active_connections: int = Field(default=0, description="活跃连接数")


class HeartbeatMessage(A2AMessage):
    """心跳消息
    
    用于保持Agent在线状态
    """
    agent_id: str = Field(..., description="Agent ID")
    status: str = Field(default="operational", description="Agent状态")
    uptime_seconds: int = Field(..., description="运行时间（秒）")
    metrics: SystemMetrics = Field(default_factory=SystemMetrics, description="系统指标")
    
    model_config = {
        "json_schema_extra": {
            "example": {
                "message_id": "heartbeat-202",
                "timestamp": "2024-01-01T12:00:00",
                "agent_id": "room-agent-bedroom-01",
                "status": "operational",
                "uptime_seconds": 3600,
                "metrics": {
                    "cpu_usage": 15.5,
                    "memory_usage": 42.3,
                    "active_connections": 2
                }
            }
        }
    }


class GlobalStateMessage(A2AMessage):
    """全局状态消息（Central Agent专用）
    
    用于发布全局家庭状态
    """
    home_mode: str = Field(..., description="家庭模式: home/away/sleep/vacation")
    active_users: List[str] = Field(default_factory=list, description="当前活跃用户列表")
    risk_level: str = Field(default="normal", description="系统风险状态: normal/warning/critical")
    temporal_context: Optional[Dict[str, str]] = Field(None, description="时间上下文")


class PolicyUpdateMessage(A2AMessage):
    """策略更新消息（Central Agent专用）
    
    用于发布策略更新
    """
    policy_name: str = Field(..., description="策略名称")
    rules: Dict[str, Any] = Field(..., description="策略规则")
    effective_from: Optional[str] = Field(None, description="生效开始时间")
    effective_until: Optional[str] = Field(None, description="生效结束时间")


class ArbitrationRequestMessage(A2AMessage):
    """仲裁请求消息（Central Agent专用）
    
    用于请求Central Agent仲裁冲突
    """
    requesting_agent: str = Field(..., description="请求仲裁的Agent ID")
    conflicting_agents: List[str] = Field(default_factory=list, description="冲突的Agent列表")
    conflict_type: str = Field(..., description="冲突类型")
    intent: Dict[str, Any] = Field(..., description="用户意图")
    context: Dict[str, Any] = Field(default_factory=dict, description="上下文信息")


class ArbitrationResponseMessage(A2AMessage):
    """仲裁响应消息（Central Agent专用）
    
    用于返回仲裁决策
    """
    request_id: str = Field(..., description="原始请求ID")
    decision: str = Field(..., description="仲裁决策: accept/reject/partial_accept/defer")
    reason: str = Field(..., description="决策原因")
    suggestion: Optional[str] = Field(None, description="建议")
    modified_action: Optional[Dict[str, Any]] = Field(None, description="修改后的动作")


class SystemEventMessage(A2AMessage):
    """系统事件消息
    
    用于通知系统事件
    """
    event_type: str = Field(..., description="事件类型")
    event_data: Dict[str, Any] = Field(..., description="事件数据")