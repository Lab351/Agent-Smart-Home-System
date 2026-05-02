#!/usr/bin/env python3
"""测试Room Agent心跳监听"""
import json
import sys
from datetime import datetime

try:
    import paho.mqtt.client as mqtt
except ImportError:
    print(
        "此脚本是 legacy MQTT 调试工具。如需运行旧 MQTT 心跳监听脚本，请单独安装 paho-mqtt。",
        file=sys.stderr,
    )
    print("例如：python -m pip install paho-mqtt", file=sys.stderr)
    raise SystemExit(1)

# MQTT配置
BROKER = "120.78.228.69"
PORT = 1884
ROOM_ID = "livingroom"
AGENT_ID = "room-agent-livingroom"

# Heartbeat topic
HEARTBEAT_TOPIC = f"room/{ROOM_ID}/agent/{AGENT_ID}/heartbeat"
STATE_TOPIC = f"room/{ROOM_ID}/agent/{AGENT_ID}/state"

def on_connect(client, userdata, flags, rc):
    """连接回调"""
    if rc == 0:
        print("✓ 已连接到MQTT Broker")
        print(f"  Broker: {BROKER}:{PORT}")
        print()

        # 订阅heartbeat和state
        client.subscribe(HEARTBEAT_TOPIC)
        client.subscribe(STATE_TOPIC)
        print(f"✓ 已订阅topic:")
        print(f"  - {HEARTBEAT_TOPIC}")
        print(f"  - {STATE_TOPIC}")
        print()
        print("=" * 60)
        print("开始监听消息...")
        print("=" * 60)
    else:
        print(f"✗ 连接失败，错误码: {rc}")

def on_message(client, userdata, msg):
    """消息回调"""
    timestamp = datetime.now().strftime("%H:%M:%S")
    topic = msg.topic
    payload = msg.payload.decode("utf-8")

    print(f"\n[{timestamp}] 收到消息:")
    print(f"Topic: {topic}")

    try:
        # 尝试解析JSON
        data = json.loads(payload)
        print(f"内容: {json.dumps(data, indent=2, ensure_ascii=False)}")
    except json.JSONDecodeError:
        # 不是JSON，直接显示
        print(f"内容: {payload}")

    print("-" * 60)

def main():
    """主函数"""
    print("=" * 60)
    print("Room Agent 心跳监听工具")
    print("=" * 60)
    print(f"Room ID: {ROOM_ID}")
    print(f"Agent ID: {AGENT_ID}")
    print()

    # 创建MQTT客户端
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    client.on_connect = on_connect
    client.on_message = on_message

    # 连接到Broker
    print("正在连接到MQTT Broker...")
    try:
        client.connect(BROKER, PORT, 60)
    except Exception as e:
        print(f"✗ 连接失败: {e}")
        return

    # 保持连接
    client.loop_forever()

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n停止监听")
