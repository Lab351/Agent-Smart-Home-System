# shared/models/__init__.py
"""共享数据模型导出"""

# 新的统一A2A模型
from shared.models.agent_card import (
    AgentCard,
    AgentType,
    AgentSkill,
    DeviceCapability,
    CommunicationConfig,
)

from shared.models.a2a_messages import (
    A2AMessage,
    A2ATask,
    TaskState,
    ControlMessage,
    StateMessage,
    DescriptionMessage,
    HeartbeatMessage,
    DeviceState,
    SystemMetrics,
    GlobalStateMessage,
    PolicyUpdateMessage,
    ArbitrationRequestMessage,
    ArbitrationResponseMessage,
    SystemEventMessage,
)

# 保留对旧mqtt_messages的兼容性导入
from shared.models.mqtt_messages import (
    ControlMessage as MqttControlMessage,
    StateMessage as MqttStateMessage,
    DescribeMessage,
    DescriptionMessage as MqttDescriptionMessage,
    HeartbeatMessage as MqttHeartbeatMessage,
    DeviceState as MqttDeviceState,
    DeviceCapability as MqttDeviceCapability,
    SystemMetrics as MqttSystemMetrics,
    GlobalStateMessage as MqttGlobalStateMessage,
    PolicyUpdateMessage as MqttPolicyUpdateMessage,
    ArbitrationRequestMessage as MqttArbitrationRequestMessage,
    ArbitrationResponseMessage as MqttArbitrationResponseMessage,
    SystemEventMessage as MqttSystemEventMessage,
)

__all__ = [
    # 新的A2A标准模型（推荐使用）
    "AgentCard",
    "AgentType",
    "AgentSkill",
    "DeviceCapability",
    "CommunicationConfig",
    "A2AMessage",
    "A2ATask",
    "TaskState",
    "ControlMessage",
    "StateMessage",
    "DescriptionMessage",
    "HeartbeatMessage",
    "DeviceState",
    "SystemMetrics",
    "GlobalStateMessage",
    "PolicyUpdateMessage",
    "ArbitrationRequestMessage",
    "ArbitrationResponseMessage",
    "SystemEventMessage",
    # 旧模型（保持兼容性）
    "DescribeMessage",
    "MqttControlMessage",
    "MqttStateMessage",
    "MqttDescriptionMessage",
    "MqttHeartbeatMessage",
    "MqttDeviceState",
    "MqttDeviceCapability",
    "MqttSystemMetrics",
    "MqttGlobalStateMessage",
    "MqttPolicyUpdateMessage",
    "MqttArbitrationRequestMessage",
    "MqttArbitrationResponseMessage",
    "MqttSystemEventMessage",
]
