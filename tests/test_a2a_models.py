"""
测试A2A模型和AgentCard

验证：
1. AgentCard创建和序列化
2. A2A消息格式
3. Pydantic验证
"""

import pytest

from shared.models import AgentCard, AgentSkill, AgentType, A2AMessage, A2ATask
from shared.models.a2a_messages import (
    ControlMessage,
    DescriptionMessage,
    DeviceState,
    StateMessage,
)
from shared.models.agent_card import DeviceCapability


def _build_agent_card() -> AgentCard:
    # 创建设备能力
    devices = [
        DeviceCapability(
            id="light_1",
            name="主灯",
            type="light",
            actions=["on", "off", "set_brightness", "set_color_temp"],
            state_attributes=["brightness", "color_temp", "power_state"]
        )
    ]
    
    # 创建Agent技能
    skills = [
        AgentSkill(
            id="adjust_lighting",
            name="调节照明",
            description="根据场景自动调节灯光亮度和色温",
            tags=["light", "automation"],
            examples=["调暗灯光", "打开阅读模式"]
        )
    ]
    
    # 创建Agent Card
    agent_card = AgentCard(
        id="room-agent-bedroom-01",
        name="卧室房间代理",
        description="管理卧室智能设备的Agent",
        version="1.0.0",
        agent_type=AgentType.ROOM,
        capabilities=["light_control", "curtain_control", "climate_control"],
        skills=skills,
        devices=devices,
        metadata={"room_id": "bedroom_01", "location": "bedroom"}
    )
    return agent_card


@pytest.fixture
def agent_card() -> AgentCard:
    return _build_agent_card()


def test_agent_card():
    """测试AgentCard创建和序列化"""
    print("=" * 60)
    print("测试 AgentCard")
    print("=" * 60)

    agent_card = _build_agent_card()
    
    print("\n✅ AgentCard创建成功:")
    print(f"  ID: {agent_card.id}")
    print(f"  Name: {agent_card.name}")
    print(f"  Type: {agent_card.agent_type}")
    print(f"  Capabilities: {agent_card.capabilities}")
    print(f"  Devices: {len(agent_card.devices)}")
    print(f"  Skills: {len(agent_card.skills)}")
    
    # 序列化为JSON
    card_json = agent_card.model_dump_json(indent=2)
    print("\n📄 AgentCard JSON:")
    print(card_json)
    
    # 反序列化
    parsed_card = AgentCard.model_validate_json(card_json)
    assert parsed_card.id == agent_card.id
    assert parsed_card.agent_type == agent_card.agent_type
    print("\n✅ AgentCard序列化和反序列化成功")


def _build_a2a_messages():
    control_msg = ControlMessage(
        source_agent="personal-agent-user1",
        target_device="light_1",
        action="set_brightness",
        parameters={"brightness": 80}
    )

    state_msg = StateMessage(
        agent_id="room-agent-bedroom-01",
        devices=[
            DeviceState(
                device_id="light_1",
                state="on",
                attributes={"brightness": 80, "color_temp": 4000}
            )
        ]
    )

    task = A2ATask(
        status="pending",
        message=control_msg
    )
    return control_msg, state_msg, task


def test_a2a_messages():
    """测试A2A消息格式"""
    print("\n" + "=" * 60)
    print("测试 A2A消息")
    print("=" * 60)

    control_msg, state_msg, task = _build_a2a_messages()
    
    print("\n✅ ControlMessage创建成功:")
    print(f"  Message ID: {control_msg.message_id}")
    print(f"  Source: {control_msg.source_agent}")
    print(f"  Target: {control_msg.target_device}")
    print(f"  Action: {control_msg.action}")
    print(f"  Timestamp: {control_msg.timestamp}")
    
    print("\n✅ StateMessage创建成功:")
    print(f"  Agent ID: {state_msg.agent_id}")
    print(f"  Devices: {len(state_msg.devices)}")
    
    print("\n✅ A2ATask创建成功:")
    print(f"  Task ID: {task.id}")
    print(f"  Status: {task.status}")
    print(f"  Created: {task.created_at}")


def test_description_message(agent_card):
    """测试DescriptionMessage"""
    print("\n" + "=" * 60)
    print("测试 DescriptionMessage")
    print("=" * 60)
    
    desc_msg = DescriptionMessage(
        agent_id=agent_card.id,
        agent_card=agent_card
    )
    
    print("\n✅ DescriptionMessage创建成功:")
    print(f"  Message ID: {desc_msg.message_id}")
    print(f"  Agent ID: {desc_msg.agent_id}")
    print(f"  Agent Card: {desc_msg.agent_card.name}")
    
    # 序列化
    msg_json = desc_msg.model_dump_json(indent=2)
    print("\n📄 DescriptionMessage JSON (部分):")
    print(msg_json[:500] + "...")


def main():
    """运行所有测试"""
    print("\n" + "🧪" * 30)
    print("A2A模型测试套件")
    print("🧪" * 30 + "\n")
    
    # 测试AgentCard
    agent_card = _build_agent_card()
    test_agent_card()
    
    # 测试A2A消息
    test_a2a_messages()
    
    # 测试DescriptionMessage
    test_description_message(agent_card)
    
    print("\n" + "=" * 60)
    print("✅ 所有测试通过！")
    print("=" * 60)
    
    print("\n📊 测试摘要:")
    print(f"  - AgentCard: ✅ 创建、序列化、反序列化")
    print(f"  - ControlMessage: ✅ 创建和验证")
    print(f"  - StateMessage: ✅ 创建和验证")
    print(f"  - A2ATask: ✅ 创建和管理")
    print(f"  - DescriptionMessage: ✅ 包含AgentCard")


if __name__ == "__main__":
    main()
