"""Home Assistant MCP Client tests"""

import asyncio
import sys
from pathlib import Path

# 添加项目根目录到路径
sys.path.insert(0, str(Path(__file__).parent.parent))

from core.home_assistant_mcp import HomeAssistantMCPClient, ServiceCall


async def test_home_assistant_mcp():
    """测试 Home Assistant MCP 连接"""
    print("=" * 60)
    print("Testing Home Assistant MCP Client")
    print("=" * 60)

    # 配置（请根据实际情况修改）
    config = {
        "server_url": "ws://localhost:3000/sse",
        "api_key": "YOUR_HA_API_KEY",
        "entities": [
            "sensor.temperature_livingroom",
            "light.livingroom_ceiling"
        ],
        "services": [
            "light.turn_on",
            "light.turn_off"
        ]
    }

    # 创建客户端
    client = HomeAssistantMCPClient(config)

    try:
        # 连接
        print("\n[TEST] Connecting to MCP Server...")
        connected = await client.connect()

        if not connected:
            print("[TEST] ❌ Failed to connect")
            print("[TEST]   Please check:")
            print("[TEST]   1. Home Assistant is running")
            print("[TEST]   2. MCP Server is started")
            print("[TEST]   3. API Key is correct")
            return

        print("[TEST] ✅ Connected successfully")

        # 等待状态同步
        print("\n[TEST] Waiting for state sync (5 seconds)...")
        await asyncio.sleep(5)

        # 获取状态
        print("\n[TEST] Getting entity states...")
        all_states = await client.get_all_states()
        print(f"[TEST] Retrieved {len(all_states)} states")

        for entity_id, state in all_states.items():
            print(f"[TEST]   - {entity_id}: {state.state}")

        # 调用服务
        print("\n[TEST] Calling service...")
        service = ServiceCall(
            domain="light",
            service="turn_on",
            service_data={
                "entity_id": "light.livingroom_ceiling",
                "brightness": 255
            }
        )

        result = await client.call_service(service)
        if result:
            print("[TEST] ✅ Service called successfully")
        else:
            print("[TEST] ❌ Service call failed")

        # 保持运行
        print("\n[TEST] Running... Press Ctrl+C to stop")
        print("[TEST] Listening for state changes...")

        # 监听状态变化
        def on_state_change(state):
            print(f"[TEST] State changed: {state.entity_id} -> {state.state}")

        client.register_state_listener(on_state_change)

        # 保持运行
        while True:
            await asyncio.sleep(1)

    except KeyboardInterrupt:
        print("\n[TEST] Interrupted by user")
    finally:
        # 断开连接
        print("\n[TEST] Disconnecting...")
        await client.disconnect()
        print("[TEST] Disconnected")
        print("=" * 60)


if __name__ == "__main__":
    asyncio.run(test_home_assistant_mcp())
