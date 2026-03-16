"""Central Agent 功能测试

测试场景：
1. 全局状态管理
2. 策略引擎
3. 冲突仲裁
4. MQTT通信
"""

import asyncio
import json
import sys
from pathlib import Path

# 添加项目根目录到路径
sys.path.insert(0, str(Path(__file__).parent.parent))

from core.central_agent import CentralAgent, StateManager, PolicyEngine, Arbitrator
from shared.models.mqtt_messages import ArbitrationRequestMessage


async def test_state_manager():
    """测试全局状态管理器"""
    print("\n" + "="*60)
    print("测试 1: 全局状态管理器")
    print("="*60)

    # 创建状态管理器
    state_manager = StateManager()

    # 测试初始状态
    print(f"初始模式: {state_manager.get_home_mode()}")
    print(f"活跃用户: {state_manager.get_active_users()}")
    print(f"是否有人在家: {state_manager.is_anyone_home()}")

    # 测试模式切换
    await state_manager.set_home_mode("sleep", "schedule")
    print(f"切换后模式: {state_manager.get_home_mode()}")

    # 测试用户管理
    await state_manager.add_active_user("user1")
    print(f"添加用户后: {state_manager.get_active_users()}")
    print(f"是否有人在家: {state_manager.is_anyone_home()}")

    await state_manager.add_active_user("user2")
    print(f"添加第二个用户后: {state_manager.get_active_users()}")

    await state_manager.remove_active_user("user1")
    print(f"移除用户后: {state_manager.get_active_users()}")

    # 测试风险等级
    await state_manager.set_risk_level("warning")
    print(f"风险等级: {state_manager.get_risk_level()}")

    print("✅ 状态管理器测试通过")


async def test_policy_engine():
    """测试策略引擎"""
    print("\n" + "="*60)
    print("测试 2: 策略引擎")
    print("="*60)

    # 创建策略引擎
    policy_engine = PolicyEngine()

    # 测试策略加载
    policies = policy_engine.get_all_policies()
    print(f"已加载策略数量: {len(policies)}")
    for name, policy in policies.items():
        print(f"  - {name}: {policy.description} (priority={policy.priority})")

    # 测试策略检查
    intent1 = {
        "action": "music_play",
        "parameters": {"volume": 80}
    }
    context1 = {
        "home_mode": "sleep",
        "user_role": "adult"
    }

    violates, policy = policy_engine.check_intent(intent1, context1)
    print(f"\n意图1: {intent1}")
    print(f"上下文: {context1}")
    print(f"是否违反策略: {violates}")
    if violates:
        print(f"违反的策略: {policy.name}")

        # 测试降级建议
        modified = policy_engine.get_suggested_modification(intent1, policy)
        print(f"降级建议: {modified}")

    # 测试不违反的情况
    intent2 = {
        "action": "music_play",
        "parameters": {"volume": 15}
    }

    violates2, _ = policy_engine.check_intent(intent2, context1)
    print(f"\n意图2: {intent2}")
    print(f"是否违反策略: {violates2}")

    print("✅ 策略引擎测试通过")


async def test_arbitrator():
    """测试冲突仲裁器"""
    print("\n" + "="*60)
    print("测试 3: 冲突仲裁器")
    print("="*60)

    # 创建仲裁器和策略引擎
    arbitrator = Arbitrator()
    policy_engine = PolicyEngine()

    # 测试策略违规仲裁
    request = ArbitrationRequestMessage(
        message_id="test-arbitration-001",
        timestamp="2024-01-15T22:30:00Z",
        requesting_agent="personal-agent-user1",
        conflicting_agents=[],
        conflict_type="policy_violation",
        intent={
            "action": "music_play",
            "parameters": {"volume": 80}
        },
        context={
            "room_id": "bedroom",
            "home_mode": "sleep"
        }
    )

    print(f"仲裁请求: {request.message_id}")
    print(f"冲突类型: {request.conflict_type}")
    print(f"意图: {request.intent}")

    # 执行仲裁
    response = await arbitrator.arbitrate(request, policy_engine)

    print(f"\n仲裁结果:")
    print(f"决策: {response.decision}")
    print(f"原因: {response.reason}")
    if response.modified_action:
        print(f"修改后的动作: {response.modified_action}")

    # 测试多用户冲突仲裁
    request2 = ArbitrationRequestMessage(
        message_id="test-arbitration-002",
        timestamp="2024-01-15T22:31:00Z",
        requesting_agent="personal-agent-user1",
        conflicting_agents=["personal-agent-user2"],
        conflict_type="multi_user_intent",
        intent={
            "action": "light_on",
            "parameters": {"brightness": 100}
        },
        context={}
    )

    print(f"\n仲裁请求2: {request2.message_id}")
    print(f"冲突类型: {request2.conflict_type}")

    response2 = await arbitrator.arbitrate(request2, policy_engine)

    print(f"\n仲裁结果2:")
    print(f"决策: {response2.decision}")
    print(f"原因: {response2.reason}")

    # 查看仲裁历史
    history = arbitrator.get_arbitration_history(limit=10)
    print(f"\n仲裁历史记录数: {len(history)}")

    print("✅ 冲突仲裁器测试通过")


async def test_central_agent():
    """测试Central Agent主类"""
    print("\n" + "="*60)
    print("测试 4: Central Agent 主类")
    print("="*60)

    # 创建配置
    config = {
        "agent_id": "central-agent-test",
        "home_id": "home-test",
        "version": "1.0.0",
        "mqtt": {
            "brokers": [
                {
                    "room_id": "livingroom",
                    "host": "120.78.228.69",
                    "port": 1884
                }
            ]
        },
        "heartbeat": {
            "interval": 30
        }
    }

    # 创建Central Agent
    agent = CentralAgent(config)

    print(f"Agent ID: {agent.agent_id}")
    print(f"Home ID: {agent.home_id}")

    # 测试模式切换（不启动MQTT）
    await agent.set_home_mode("sleep")
    print(f"设置模式后: {agent.get_home_mode()}")

    # 测试用户管理
    await agent.add_active_user("user1")
    await agent.add_active_user("user2")
    print(f"活跃用户: {agent.get_active_users()}")

    await agent.remove_active_user("user1")
    print(f"移除用户后: {agent.get_active_users()}")

    print("✅ Central Agent 主类测试通过")


async def main():
    """主测试函数"""
    print("="*60)
    print("Central Agent 功能测试")
    print("="*60)

    try:
        # 运行所有测试
        await test_state_manager()
        await test_policy_engine()
        await test_arbitrator()
        await test_central_agent()

        print("\n" + "="*60)
        print("✅ 所有测试通过！")
        print("="*60)

    except Exception as e:
        print(f"\n❌ 测试失败: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(main())
