#!/usr/bin/env python3
"""
Room Agent 启动脚本
"""

import asyncio
import sys
from pathlib import Path

# 添加项目根目录到路径
sys.path.insert(0, str(Path(__file__).parent.parent))

# 导入 Room Agent
from core.room_agent.room_agent import RoomAgent
import config

# 加载YAML配置文件
def load_beacon_config():
    """从YAML配置文件加载beacon配置"""
    import yaml

    config_path = Path(config.ROOM_AGENT_CONFIG_PATH)
    if config_path.exists():
        with open(config_path, 'r', encoding='utf-8') as f:
            yaml_config = yaml.safe_load(f)
            return yaml_config.get("beacon", {})
    else:
        # 默认配置
        return {
            "enabled": True,
            "uuid": "01234567-89AB-CDEF-0123456789ABCDEF",
            "major": 2,  # 默认bedroom
            "minor": 0
        }


async def main():
    """启动 Room Agent"""
    print("="*60)
    print("Room Agent - 房间智能体")
    print("="*60)

    # 从YAML配置文件加载beacon配置
    beacon_config = load_beacon_config()
    print(f"[Main] Loaded beacon config from YAML: major={beacon_config.get('major', 2)}, enabled={beacon_config.get('enabled', True)}")

    # 从配置创建 Room Agent
    room_id = config.ROOM_ID
    agent_config = {
        "agent_id": config.AGENT_ID,
        "version": "1.0.0",
        "capabilities": ["device_control", "state_management", "scene_activation"],

        "mqtt": {
            "broker": {
                "host": config.MQTT_BROKER_HOST,
                "port": config.MQTT_BROKER_PORT,
            }
        },

        "heartbeat": {
            "interval": 30
        },

        "beacon": {
            "enabled": beacon_config.get("enabled", config.BEACON_ENABLED == "true"),
            "uuid": beacon_config.get("uuid", "01234567-89AB-CDEF-0123456789ABCDEF"),
            "major": beacon_config.get("major", 2),
            "minor": beacon_config.get("minor", 0)
        }
    }

    # 创建 Room Agent
    agent = RoomAgent(room_id, agent_config)

    try:
        # 启动 Agent
        await agent.start()

        print("\n✅ Room Agent is running")
        print(f"   Room ID: {room_id}")
        print(f"   Agent ID: {agent.agent_id}")
        print(f"   MQTT Broker: {config.MQTT_BROKER_HOST}:{config.MQTT_BROKER_PORT}")
        print(f"   Beacon: {'enabled' if agent_config['beacon']['enabled'] else 'disabled'}")
        print("\n按 Ctrl+C 停止...")

        # 保持运行
        while True:
            await asyncio.sleep(1)

    except KeyboardInterrupt:
        print("\n\n停止 Room Agent...")
        await agent.stop()
        print("Room Agent 已停止")
    except Exception as e:
        print(f"\n错误: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        sys.exit(0)
