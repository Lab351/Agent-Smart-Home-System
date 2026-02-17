#!/usr/bin/env python3
"""
Home Agent 和 Room Agent A2A 通信测试脚本

测试场景：
1. Central Agent 连接到 Room Agent MQTT Broker
2. 订阅 Room Agent 的心跳和状态
3. 发布全局状态到 Room Agent
4. 测试仲裁场景
"""

import asyncio
import json
import sys
import time
from pathlib import Path

# 添加项目根目录到路径
sys.path.insert(0, str(Path(__file__).parent.parent))

try:
    import paho.mqtt.client as mqtt
except ImportError:
    print("Error: paho-mqtt not installed. Run: pip install paho-mqtt")
    sys.exit(1)


class A2ATest:
    """A2A 通信测试类"""

    def __init__(self, room_broker_host: str, room_broker_port: int):
        """初始化测试

        Args:
            room_broker_host: Room Agent MQTT broker 地址
            room_broker_port: Room Agent MQTT broker 端口
        """
        self.room_broker_host = room_broker_host
        self.room_broker_port = room_broker_port

        # MQTT 客户端（模拟 Central Agent）
        self.client = None
        self.connected = False

        # 测试结果
        self.test_results = {
            "connection": False,
            "heartbeat_received": False,
            "state_received": False,
            "global_state_published": False,
        }

        # 接收到的消息
        self.messages = []

    def on_connect(self, client, userdata, flags, reason_code, properties):
        """连接回调"""
        self.connected = True
        print(f"✅ Connected to {self.room_broker_host}:{self.room_broker_port}")
        self.test_results["connection"] = True

        # 订阅 Room Agent 的心跳和状态
        client.subscribe("room/+/agent/+/heartbeat", qos=0)
        client.subscribe("room/+/agent/+/state", qos=0)
        print("✅ Subscribed to heartbeat and state topics")

    def on_disconnect(self, client, userdata, reason_code):
        """断开连接回调"""
        self.connected = False
        print(f"❌ Disconnected (reason code: {reason_code})")

    def on_message(self, client, userdata, msg):
        """消息接收回调"""
        topic = msg.topic
        payload = msg.payload.decode('utf-8')

        try:
            message = json.loads(payload)
            self.messages.append({"topic": topic, "payload": message})

            # 根据主题类型更新测试结果
            if "heartbeat" in topic:
                if not self.test_results["heartbeat_received"]:
                    self.test_results["heartbeat_received"] = True
                    print(f"✅ Heartbeat received from {message.get('agent_id')}")
                    print(f"   Status: {message.get('status')}, Uptime: {message.get('uptime_seconds')}s")

            elif "state" in topic:
                if not self.test_results["state_received"]:
                    self.test_results["state_received"] = True
                    print(f"✅ State received from {message.get('agent_id')}")
                    print(f"   Agent status: {message.get('agent_status')}")

        except json.JSONDecodeError as e:
            print(f"⚠️  Failed to parse message: {e}")

    async def test_connection(self, timeout: int = 5):
        """测试连接功能

        Args:
            timeout: 超时时间（秒）
        """
        print("\n" + "="*60)
        print("测试 1: 连接到 Room Agent MQTT Broker")
        print("="*60)

        # 创建 MQTT 客户端
        self.client = mqtt.Client(
            client_id="central-agent-test",
            protocol=mqtt.MQTTv311,
            callback_api_version=mqtt.CallbackAPIVersion.VERSION2
        )

        # 设置回调
        self.client.on_connect = self.on_connect
        self.client.on_disconnect = self.on_disconnect
        self.client.on_message = self.on_message

        # 连接
        print(f"Connecting to {self.room_broker_host}:{self.room_broker_port}...")
        self.client.connect(self.room_broker_host, self.room_broker_port, keepalive=60)

        # 启动网络循环
        self.client.loop_start()

        # 等待连接
        for i in range(timeout):
            await asyncio.sleep(1)
            if self.connected:
                break
            print(f"   Waiting... ({i+1}/{timeout})")

        if not self.connected:
            print(f"❌ Failed to connect to Room Agent")
            return False

        # 等待接收心跳和状态
        print("\nWaiting for heartbeat and state messages...")
        for i in range(10):
            await asyncio.sleep(1)
            if self.test_results["heartbeat_received"] and self.test_results["state_received"]:
                break

        return True

    async def test_publish_global_state(self):
        """测试发布全局状态"""
        print("\n" + "="*60)
        print("测试 2: 发布全局状态")
        print("="*60)

        global_state = {
            "message_id": "test-001",
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "home_mode": "home",
            "active_users": ["user1", "user2"],
            "risk_level": "normal",
        }

        topic = "home/state"
        self.client.publish(topic, json.dumps(global_state), qos=0)

        print(f"✅ Published global state to {topic}")
        print(f"   Home mode: {global_state['home_mode']}")
        print(f"   Active users: {global_state['active_users']}")
        self.test_results["global_state_published"] = True

    async def test_arbitration_scenario(self):
        """测试仲裁场景"""
        print("\n" + "="*60)
        print("测试 3: 模拟仲裁场景")
        print("="*60)

        # 模拟策略违规仲裁请求
        arbitration_request = {
            "message_id": "arbitration-test-001",
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
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

        topic = "home/arbitration"
        self.client.publish(topic, json.dumps(arbitration_request), qos=1)

        print(f"✅ Published arbitration request to {topic}")
        print(f"   Conflict type: {arbitration_request['conflict_type']}")
        print(f"   Intent: {arbitration_request['intent']}")
        print("   (Note: Actual arbitration requires Central Agent running)")

    def print_summary(self):
        """打印测试摘要"""
        print("\n" + "="*60)
        print("测试摘要")
        print("="*60)

        total_tests = len(self.test_results)
        passed_tests = sum(1 for v in self.test_results.values() if v)

        print(f"\n总测试数: {total_tests}")
        print(f"通过: {passed_tests}")
        print(f"失败: {total_tests - passed_tests}")

        print("\n详细结果:")
        for test_name, result in self.test_results.items():
            status = "✅ 通过" if result else "❌ 失败"
            print(f"  {test_name}: {status}")

        print(f"\n接收到的消息数: {len(self.messages)}")

        if passed_tests == total_tests:
            print("\n🎉 所有测试通过！")
        else:
            print("\n⚠️  部分测试失败，请检查配置")

    async def cleanup(self):
        """清理资源"""
        if self.client:
            self.client.loop_stop()
            self.client.disconnect()


async def main():
    """主函数"""
    import argparse

    parser = argparse.ArgumentParser(description="Home Agent 和 Room Agent A2A 通信测试")
    parser.add_argument(
        "--host",
        "-H",
        type=str,
        default="localhost",
        help="Room Agent MQTT broker host (default: localhost)"
    )
    parser.add_argument(
        "--port",
        "-p",
        type=int,
        default=1883,
        help="Room Agent MQTT broker port (default: 1883)"
    )

    args = parser.parse_args()

    print("="*60)
    print("Home Agent ↔ Room Agent A2A 通信测试")
    print("="*60)
    print(f"Room Agent Broker: {args.host}:{args.port}")
    print("="*60)

    # 创建测试实例
    test = A2ATest(args.host, args.port)

    try:
        # 测试连接
        if not await test.test_connection():
            print("\n❌ 连接失败，请检查：")
            print("1. Room Agent 是否正在运行")
            print("2. MQTT Broker 地址和端口是否正确")
            print("3. 网络连接是否正常")
            return

        # 测试发布全局状态
        await test.test_publish_global_state()

        # 测试仲裁场景
        await test.test_arbitration_scenario()

        # 等待一段时间接收消息
        print("\n等待 5 秒接收消息...")
        await asyncio.sleep(5)

        # 打印测试摘要
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
