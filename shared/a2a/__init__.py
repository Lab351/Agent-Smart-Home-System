# shared/a2a/__init__.py
"""Agent-to-Agent 通信模块

提供标准化的 Agent 间通信接口和实现
"""

from shared.a2a.base_agent import BaseA2AAgent
from shared.a2a.personal_agent import PersonalAgentA2A
from shared.a2a.room_agent import RoomAgentA2A
from shared.a2a.central_agent import CentralAgentA2A

__all__ = [
    "BaseA2AAgent",
    "PersonalAgentA2A",
    "RoomAgentA2A",
    "CentralAgentA2A",
]