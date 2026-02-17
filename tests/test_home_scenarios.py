#!/usr/bin/env python3
"""
家居场景测试脚本

测试真实的家居场景：
1. 场景一：用户回家，激活回家模式
2. 场景二：夜间自动切换到睡眠模式
3. 场景三：睡眠模式下用户请求播放音乐（策略违规仲裁）
"""

import asyncio
import json
import sys
import time
from pathlib import Path
from datetime import datetime

# 添加项目根目录到路径
sys.path.insert(0, str(Path(__file__).parent.parent))

try:
    import paho.mqtt.client as mqtt
except ImportError:
    print("Error: paho-mqtt not installed. Run: pip install paho-mqtt")
    sys.exit(1)


class HomeScenarioTest:
    """家居场景测试类"""

    def __init__(self, room_broker_host: str, room_broker_port: int):
        """初始化测试

        Args:
            room_broker_host: Room Agent MQTT broker 地址
            room_broker_port: Room Agent MQTT broker 端口
        """
        self.room_broker_host = room_broker_host
        self.room_broker_port = room_broker_port

        # MQTT 客户端
        self.client = None
        self.connected = False

        # 接收的消息
        self.messages = []

        # 场景状态
        self.current_mode = "unknown"

    def on_connect(self, client, userdata, flags, reason_code, properties):
        """连接回调"""
        self.connected = True
        print(f"✅ 已连接到 Room Agent ({self.room_broker_host}:{self.room_broker_port})")

    def on_disconnect(self, client, userdata, reason_code, properties):
        """断开连接回调"""
        self.connected = False

    def on_message(self, client, userdata, msg):
        """消息接收回调"""
        topic = msg.topic
        payload = msg.payload.decode('utf-8')

        try:
            message = json.loads(payload)
            self.messages.append({
                "time": datetime.now().strftime("%H:%M:%S"),
                "topic": topic,
                "payload": message
            })

            # 打印接收到的消息
            msg_type = "心跳" if "heartbeat" in topic else "状态" if "state" in topic else "其他"
            agent_id = message.get("agent_id", "unknown")
            print(f"   📨 [{msg_type}] 来自 {agent_id}")

        except json.JSONDecodeError:
            pass

    async def connect(self):
        """连接到 Room Agent"""
        print("\n连接到 Room Agent MQTT Broker...")

        self.client = mqtt.Client(
            client_id="scenario-test",
            protocol=mqtt.MQTTv311,
            callback_api_version=mqtt.CallbackAPIVersion.VERSION2
        )

        self.client.on_connect = self.on_connect
        self.client.on_disconnect = self.on_disconnect
        self.client.on_message = self.on_message

        self.client.connect(self.room_broker_host, self.room_broker_port, keepalive=60)
        self.client.loop_start()

        # 等待连接
        for _ in range(5):
            await asyncio.sleep(0.5)
            if self.connected:
                return True

        return False

    async def scenario_1_home_mode(self):
        """场景一：用户回家，激活回家模式"""
        print("\n" + "="*70)
        print("场景一：用户回家")
        print("="*70)
        print("描述：用户从外面回家，系统检测到用户，激活回家模式")
        print("预期：所有房间接收到全局状态更新")

        # 发布全局状态
        global_state = {
            "message_id": f"scenario-{int(time.time())}",
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "home_mode": "home",
            "active_users": ["user1"],
            "risk_level": "normal",
            "temporal_context": {
                "day_type": "workday",
                "time_period": "evening"
            }
        }

        print(f"\n📢 发布全局状态: home_mode = 'home'")
        print(f"   活跃用户: {global_state['active_users']}")

        self.client.publish("home/state", json.dumps(global_state), qos=0)
        print("✅ 全局状态已发布")

        print("\n等待 Room Agent 响应...")
        await asyncio.sleep(3)

    async def scenario_2_sleep_mode(self):
        """场景二：夜间自动切换到睡眠模式"""
        print("\n" + "="*70)
        print("场景二：夜间模式切换")
        print("="*70)
        print("描述：时间到达 22:00，系统自动切换到睡眠模式")
        print("预期：发布模式切换事件，更新全局状态")

        # 发布模式切换事件
        mode_switch_event = {
            "message_id": f"event-{int(time.time())}",
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "event_type": "mode_switch",
            "event_data": {
                "from_mode": "home",
                "to_mode": "sleep",
                "triggered_by": "schedule",
                "effective_immediately": True
            }
        }

        print(f"\n📢 发布模式切换事件: home → sleep")
        print("   触发方式: 定时任务")

        self.client.publish("home/events", json.dumps(mode_switch_event), qos=1)
        print("✅ 模式切换事件已发布")

        # 更新全局状态
        global_state = {
            "message_id": f"state-{int(time.time())}",
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "home_mode": "sleep",
            "active_users": ["user1"],
            "risk_level": "normal"
        }

        print(f"\n📢 更新全局状态: home_mode = 'sleep'")
        self.client.publish("home/state", json.dumps(global_state), qos=0)
        print("✅ 全局状态已更新")

        print("\n等待 Room Agent 响应...")
        await asyncio.sleep(3)

    async def scenario_3_sleep_violation(self):
        """场景三：睡眠模式下请求播放音乐"""
        print("\n" + "="*70)
        print("场景三：睡眠模式下的策略冲突")
        print("="*70)
        print("描述：用户在睡眠模式下请求播放音乐（音量80%）")
        print("预期：")
        print("  1. 检测到策略违规（噪音限制）")
        print("  2. Central Agent 仲裁降级执行")
        print("  3. 返回修改后的动作（音量20%）")

        # 模拟发送仲裁请求
        arbitration_request = {
            "message_id": f"arb-{int(time.time())}",
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "requesting_agent": "personal-agent-user1",
            "conflicting_agents": [],
            "conflict_type": "policy_violation",
            "intent": {
                "action": "music_play",
                "parameters": {"volume": 80}
            },
            "context": {
                "room_id": "bedroom",
                "current_mode": "sleep"
            }
        }

        print(f"\n📨 发送仲裁请求:")
        print(f"   意图: 播放音乐")
        print(f"   参数: 音量 = 80%")
        print(f"   当前模式: sleep")
        print(f"   冲突类型: 策略违规")

        self.client.publish("home/arbitration", json.dumps(arbitration_request), qos=1)
        print("✅ 仲裁请求已发送")

        print("\n注意：实际仲裁需要 Central Agent 运行并处理请求")
        print("      此测试仅验证消息能否正确发送")

        await asyncio.sleep(2)

        # 模拟仲裁响应（如果是真实环境，Central Agent 会返回）
        print("\n📋 模拟仲裁响应:")
        print(f"   决策: partial_accept (部分接受)")
        print(f"   原因: sleep_mode_active: noise_max=minimum")
        print(f"   修改后动作: music_play with volume=20%")

    async def scenario_4_multi_user_conflict(self):
        """场景四：多用户冲突"""
        print("\n" + "="*70)
        print("场景四：多用户灯光控制冲突")
        print("="*70)
        print("描述：用户A想开灯，用户B想关灯")
        print("预期：")
        print("  1. Central Agent 接收仲裁请求")
        print("  2. 根据用户优先级决策")
        print("  3. 返回仲裁结果")

        arbitration_request = {
            "message_id": f"arb-{int(time.time())}",
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "requesting_agent": "personal-agent-user1",
            "conflicting_agents": ["personal-agent-user2"],
            "conflict_type": "multi_user_intent",
            "intent": {
                "target_device": "bedroom_light",
                "action": "on",
                "parameters": {"brightness": 100}
            },
            "context": {
                "room_id": "bedroom",
                "user1_priority": 80,
                "user2_priority": 50
            }
        }

        print(f"\n📨 发送多用户冲突仲裁请求:")
        print(f"   请求方: user1 (优先级: 80)")
        print(f"   冲突方: user2 (优先级: 50)")
        print(f"   意图: 开灯")

        self.client.publish("home/arbitration", json.dumps(arbitration_request), qos=1)
        print("✅ 仲裁请求已发送")

        await asyncio.sleep(2)

        print("\n📋 模拟仲裁响应:")
        print(f"   决策: accept (接受 user1 的请求)")
        print(f"   原因: user_priority_higher")

    def print_summary(self):
        """打印场景测试摘要"""
        print("\n" + "="*70)
        print("场景测试摘要")
        print("="*70)

        print(f"\n接收到的消息总数: {len(self.messages)}")

        if self.messages:
            print("\n消息列表:")
            for i, msg in enumerate(self.messages[-5:], 1):  # 只显示最后5条
                print(f"  {i}. [{msg['time']}] {msg['topic']}")

        print("\n提示：")
        print("  - 如果看到消息接收，说明 Room Agent 正在运行")
        print("  - 要测试完整的仲裁功能，需要启动 Central Agent")
        print("  - 可以运行 'uv run python main.py' 启动 Central Agent")

    async def cleanup(self):
        """清理资源"""
        if self.client:
            self.client.loop_stop()
            self.client.disconnect()
            print("\n✅ 清理完成")


async def main():
    """主函数"""
    import argparse

    parser = argparse.ArgumentParser(description="家居场景测试")
    parser.add_argument(
        "--host",
        "-H",
        type=str,
        default="localhost",
        help="Room Agent MQTT broker host"
    )
    parser.add_argument(
        "--port",
        "-p",
        type=int,
        default=1883,
        help="Room Agent MQTT broker port"
    )
    parser.add_argument(
        "--scenario",
        "-s",
        type=int,
        choices=[1, 2, 3, 4, 0],
        default=0,
        help="运行特定场景 (0=全部, 1=回家, 2=睡眠, 3=策略冲突, 4=多用户)"
    )

    args = parser.parse_args()

    print("="*70)
    print("智能家居场景测试")
    print("="*70)
    print(f"Room Agent Broker: {args.host}:{args.port}")
    print("="*70)

    # 创建测试实例
    test = HomeScenarioTest(args.host, args.port)

    try:
        # 连接到 Room Agent
        if not await test.connect():
            print("\n❌ 无法连接到 Room Agent")
            print("\n请检查：")
            print("1. Room Agent 是否正在运行")
            print("2. 执行 'cd room-agent && uv run python main.py' 启动 Room Agent")
            print("3. MQTT Broker 是否在 {args.host}:{args.port} 运行")
            return

        # 根据选择运行场景
        scenarios = []
        if args.scenario == 0:
            scenarios = [1, 2, 3, 4]
        else:
            scenarios = [args.scenario]

        if 1 in scenarios:
            await test.scenario_1_home_mode()
        if 2 in scenarios:
            await test.scenario_2_sleep_mode()
        if 3 in scenarios:
            await test.scenario_3_sleep_violation()
        if 4 in scenarios:
            await test.scenario_4_multi_user_conflict()

        # 打印摘要
        test.print_summary()

    except KeyboardInterrupt:
        print("\n\n⚠️  测试被用户中断")
    except Exception as e:
        print(f"\n❌ 测试出错: {e}")
        import traceback
        traceback.print_exc()
    finally:
        await test.cleanup()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        sys.exit(0)
