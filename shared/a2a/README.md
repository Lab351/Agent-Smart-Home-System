# A2A (Agent-to-Agent) 通信模块使用指南

## 概述

A2A 模块提供了标准化的 Agent 间通信接口，支持 Personal Agent、Room Agent 和 Central Agent 之间的通信。

## 模块结构

```
shared/
├── mqtt/                       # MQTT 基础模块
│   ├── topic_manager.py        # Topic 管理
│   ├── message_handler.py      # 消息处理
│   ├── request_response.py     # 请求-响应模式
│   └── event_dispatcher.py     # 事件分发
└── a2a/                        # Agent-to-Agent 模块
    ├── base_agent.py           # 通用基类
    ├── personal_agent.py       # Personal Agent
    ├── room_agent.py           # Room Agent
    └── central_agent.py        # Central Agent
```

## 快速开始

### 1. Personal Agent 示例

```python
import asyncio
from shared.a2a import PersonalAgentA2A
from shared.models.mqtt_messages import DescriptionMessage

async def main():
    # 创建 Personal Agent
    personal = PersonalAgentA2A(
        agent_id="personal-agent-user1",
        broker_config={
            "host": "192.168.1.100",
            "port": 1883
        }
    )
    
    # 使用上下文管理器自动启动和停止
    async with personal:
        # 订阅房间状态更新
        @personal.on_room_state_update
        async def handle_state(data):
            print(f"Room state: {data}")
        
        # 查询房间能力
        capabilities = await personal.query_room_capabilities("bedroom")
        print(f"Capabilities: {capabilities}")
        
        # 发送设备控制命令
        await personal.send_device_control(
            room_id="bedroom",
            target_device="light_1",
            action="on",
            parameters={"brightness": 80}
        )

if __name__ == "__main__":
    asyncio.run(main())
```

### 2. Room Agent 示例

```python
import asyncio
from shared.a2a import RoomAgentA2A
from shared.models.mqtt_messages import DeviceCapability, DeviceState

async def main():
    # 创建 Room Agent
    room = RoomAgentA2A(
        agent_id="room-agent-bedroom",
        room_id="bedroom_01",
        broker_config={
            "host": "192.168.1.100",
            "port": 1883
        }
    )
    
    # 设置设备能力
    room.set_devices([
        DeviceCapability(
            id="light_1",
            name="主灯",
            type="light",
            actions=["on", "off", "set_brightness", "set_color_temp"],
            state_attributes=["brightness", "color_temp", "power_state"]
        ),
        DeviceCapability(
            id="curtain_1",
            name="窗帘",
            type="curtain",
            actions=["open", "close", "set_position"]
        )
    ])
    
    # 设置 Agent 能力
    room.set_capabilities(["light", "curtain", "climate"])
    
    async with room:
        # 注册控制回调
        @room.on_control
        async def handle_control(data):
            device_id = data['target_device']
            action = data['action']
            parameters = data.get('parameters', {})
            
            print(f"Control: {action} on {device_id}")
            
            # 执行设备控制（这里需要你的实际实现）
            # await execute_device_control(device_id, action, parameters)
            
            # 发布状态更新
            await room.publish_state([
                DeviceState(
                    device_id=device_id,
                    state="on" if action == "on" else "off",
                    attributes=parameters
                )
            ])

if __name__ == "__main__":
    asyncio.run(main())
```

### 3. Central Agent 示例

```python
import asyncio
from shared.a2a import CentralAgentA2A

async def main():
    # 创建 Central Agent
    central = CentralAgentA2A(
        agent_id="central-agent",
        broker_config={
            "host": "192.168.1.100",
            "port": 1883
        }
    )
    
    async with central:
        # 订阅房间状态更新
        @central.on_room_state_update
        async def handle_room_state(data):
            print(f"Room {data['room_id']} state: {data['status']}")
        
        # 注册仲裁回调
        @central.on_arbitration_request
        async def handle_arbitration(data):
            request_id = data['request_id']
            conflict_type = data['conflict_type']
            intent = data['intent']
            
            print(f"Arbitration request: {conflict_type}")
            
            # 根据策略做出决策
            decision = "accept"  # 或 "reject", "partial_accept"
            reason = "approved"
            
            # 发送仲裁响应
            await central.send_arbitration_response(
                request_id=request_id,
                decision=decision,
                reason=reason
            )
        
        # 发布全局状态
        await central.publish_global_state(
            home_mode="home",
            active_users=["user1", "user2"]
        )
        
        # 发布策略
        await central.publish_policy(
            policy_name="sleep_mode",
            rules={
                "light_max": "low",
                "noise_max": "minimum",
                "interruptible": False
            }
        )

if __name__ == "__main__":
    asyncio.run(main())
```

## 核心功能

### 1. 请求-响应模式

A2A 模块支持基于 Correlation ID 的请求-响应模式：

```python
# Personal Agent 查询 Room Agent 能力
capabilities = await personal.query_room_capabilities(
    room_id="bedroom",
    timeout=5.0  # 5秒超时
)

# Room Agent 请求仲裁
response = await room.request_arbitration(
    conflict_type="multi_user_intent",
    intent={"target_device": "light_1", "action": "on"},
    context={"current_mode": "sleep"},
    timeout=3.0
)
```

### 2. 事件驱动

使用事件分发器处理消息：

```python
# 注册事件监听器
@agent.on("device_control")
async def handle_control(event):
    print(f"Control event: {event.data}")

# 触发事件
await agent.emit("device_control", {"device": "light_1"})

# 一次性监听器
@agent.once("connected")
def on_connected(event):
    print("Connected!")
```

### 3. 心跳管理

Room Agent 自动发送心跳：

```python
# 心跳自动每30秒发送一次
# 包含系统指标（CPU、内存使用率等）

# 自定义心跳间隔
room.heartbeat_interval = 60  # 60秒
```

### 4. Topic 管理

Topic 自动构建和解析：

```python
from shared.mqtt import TopicManager

tm = TopicManager()

# 构建 topic
control_topic = tm.build_control_topic("bedroom_01", "room-agent-bedroom")
# 输出: room/bedroom_01/agent/room-agent-bedroom/control

# 解析 topic
info = tm.parse_topic(control_topic)
# 输出: TopicInfo(scope='room', room_id='bedroom_01', agent_id='room-agent-bedroom', ...)

# 获取推荐 QoS
qos = tm.get_qos_for_topic(TopicType.CONTROL)  # 返回 1
```

## 高级用法

### 1. 自定义 Agent

继承 `BaseA2AAgent` 创建自定义 Agent：

```python
from shared.a2a.base_agent import BaseA2AAgent
from shared.mqtt.topic_manager import AgentType

class CustomAgent(BaseA2AAgent):
    def _get_agent_type(self) -> AgentType:
        return AgentType.ROOM
    
    async def _setup_subscriptions(self):
        # 订阅自定义 topic
        self.mqtt_client.subscribe("custom/topic", qos=1)
    
    async def _handle_message(self, topic: str, message):
        # 处理自定义消息
        print(f"Custom message: {message}")
```

### 2. 批量操作

```python
# 批量查询多个房间能力
async def query_all_rooms(room_ids):
    tasks = [
        personal.query_room_capabilities(room_id)
        for room_id in room_ids
    ]
    
    results = await asyncio.gather(*tasks, return_exceptions=True)
    
    return {
        room_id: result
        for room_id, result in zip(room_ids, results)
        if not isinstance(result, Exception)
    }
```

### 3. 错误处理

```python
try:
    response = await personal.query_room_capabilities("bedroom", timeout=5.0)
except asyncio.TimeoutError:
    print("Request timeout")
except Exception as e:
    print(f"Error: {e}")
```

## 配置选项

### MQTT Broker 配置

```python
broker_config = {
    "host": "192.168.1.100",      # Broker 地址
    "port": 1883,                  # Broker 端口
    "username": "agent_user",      # 用户名（可选）
    "password": "secret"           # 密码（可选）
}
```

### Agent 配置

```python
# 心跳间隔
agent.heartbeat_interval = 30  # 秒

# 请求超时
timeout = 5.0  # 秒

# 日志级别
import logging
logging.basicConfig(level=logging.INFO)
```

## 最佳实践

### 1. 使用上下文管理器

```python
# ✅ 推荐：自动管理生命周期
async with personal:
    await personal.send_device_control(...)

# ❌ 不推荐：手动管理
await personal.start()
try:
    await personal.send_device_control(...)
finally:
    await personal.stop()
```

### 2. 异步事件处理

```python
# ✅ 推荐：异步处理
@agent.on_control
async def handle_control(data):
    await process_control(data)

# ❌ 不推荐：同步阻塞
@agent.on_control
def handle_control(data):
    time.sleep(1)  # 阻塞！
```

### 3. 错误隔离

```python
# 每个回调都有独立的错误处理
@agent.on_control
async def handle_control(data):
    try:
        await process_control(data)
    except Exception as e:
        print(f"Error: {e}")
        # 不会影响其他回调
```

## 调试

### 查看统计信息

```python
# 请求-响应管理器统计
stats = agent.request_response_manager.get_statistics()
print(f"Pending requests: {stats['total_pending']}")

# 事件分发器统计
stats = agent.event_dispatcher.get_statistics()
print(f"Event types: {stats['event_types']}")
```

### 日志

所有模块都有详细的日志输出：

```
[PersonalAgentA2A] Initialized for personal-agent-user1
[PersonalAgentA2A] Subscribed to topics
[PersonalAgentA2A] Started successfully
[MessageHandler] Sent control to light_1: on
[RequestResponseManager] Sent request abc-123 to room/bedroom/agent/room-1/describe
```

## 故障排查

### 1. 连接失败

```python
# 检查连接状态
if not agent.is_connected:
    print("Not connected to MQTT broker")
    
# 检查 Broker 配置
print(f"Broker: {agent.broker_config}")
```

### 2. 请求超时

```python
# 增加超时时间
response = await agent.query_room_capabilities("bedroom", timeout=10.0)

# 检查目标 Agent 是否在线
# （通过心跳或状态消息）
```

### 3. 消息未接收

```python
# 检查订阅
print(f"Subscribed topics: {agent.mqtt_client.message_handlers}")

# 检查 topic 格式
topic_info = agent.topic_manager.parse_topic(topic)
if not topic_info:
    print("Invalid topic format")
```

## 完整示例

参见：
- `examples/personal_agent_example.py`
- `examples/room_agent_example.py`
- `examples/central_agent_example.py`

## API 参考

详细 API 文档参见各模块的 docstring。

---

当前 A2A 共享层以 `shared.models.mqtt_messages` + `shared.mqtt` 运行时为准。

已收敛的能力包括：
- ✅ Topic 管理
- ✅ 消息处理与校验
- ✅ 请求-响应匹配
- ✅ Personal/Room/Central Agent 共用基类

使用时请显式区分 MQTT 运行时模型与 A2A 扩展模型，避免再从 `shared.models` 顶层导入同名消息类型。
