# shared/models/__init__.py
"""共享数据模型导出。

只导出没有歧义的顶层类型。运行时 MQTT 协议模型请显式从
``shared.models.mqtt_messages`` 导入；A2A 扩展模型请显式从
``shared.models.a2a_messages`` 导入。
"""

from shared.models.agent_card import (
    AgentCard,
    AgentSkill,
    AgentType,
    CommunicationConfig,
)
from shared.models.a2a_messages import A2AMessage, A2ATask, TaskState
from shared.models.mqtt_messages import DescribeMessage

__all__ = [
    "AgentCard",
    "AgentType",
    "AgentSkill",
    "CommunicationConfig",
    "A2AMessage",
    "A2ATask",
    "TaskState",
    "DescribeMessage",
]
