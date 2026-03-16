# Room Agent 状态管理

## 优先级: P0 (Critical)

## 标签
`core-feature` `room-agent` `state-management`

## 概述
实现 Room Agent 的核心状态管理，维护 Room State 作为房间状态的唯一可信源。

## 背景与动机
根据 [Room Agent 规格](../docs/agents/room-agent.md#3-房间状态模型核心)，Room Agent 必须维护一个统一的 Room State，作为唯一可信源。

## Room State 模型

```json
{
  "room_id": "bedroom_01",
  "mode": "sleep",
  "occupancy": true,
  "environment": {
    "temperature": 25.1,
    "humidity": 60,
    "light": "dim"
  },
  "devices": {
    "light": "off",
    "curtain": "closed",
    "ac": "on"
  },
  "agents": {
    "robot": "idle",
    "sensor": "online"
  },
  "timestamp": 1730000000,
  "version": 1
}
```

## 任务清单

### 状态存储
- [ ] 内存存储实现
- [ ] 可选持久化存储
- [ ] 状态版本控制
- [ ] 并发访问锁

### 状态更新
- [ ] 设备状态变化处理
- [ ] 传感器数据处理
- [ ] 上层 Agent 指令处理
- [ ] 内部推断更新

### 状态发布
- [ ] 状态变化时发布 MQTT 消息
- [ ] 支持增量更新
- [ ] 定期全量同步

### 状态查询接口
- [ ] `get_room_state()` - 获取完整状态
- [ ] `get_device_state(device_id)` - 获取设备状态
- [ ] `get_environment()` - 获取环境状态

## 接口设计

```python
class RoomStateManager:
    def __init__(self, room_id: str, mqtt_manager: MQTTClientManager):
        self.room_id = room_id
        self.state = RoomState(room_id=room_id)
        self.version = 0
        self.lock = asyncio.Lock()
        self.mqtt_manager = mqtt_manager
    
    async def update_device(self, device_id: str, state: dict) -> None:
        """更新设备状态并发布"""
        async with self.lock:
            self.state.devices[device_id] = state
            self.version += 1
            await self._publish_state()
    
    async def update_environment(self, env_data: dict) -> None:
        """更新环境数据并发布"""
        async with self.lock:
            self.state.environment.update(env_data)
            self.version += 1
            await self._publish_state()
    
    async def set_mode(self, mode: str) -> None:
        """设置房间模式并执行对应行为"""
        async with self.lock:
            old_mode = self.state.mode
            self.state.mode = mode
            self.version += 1
            await self._execute_mode_actions(old_mode, mode)
            await self._publish_state()
    
    def get_state(self) -> RoomState:
        """获取当前状态快照"""
        return self.state.model_copy()
```

## 文件位置
- `room-agent/core/room_agent/state_manager.py`

## 模式切换行为

```yaml
modes:
  sleep:
    actions:
      - curtain: "close"
      - light: "off"
      - ac: {temp: 26, mode: "cool"}
  
  meeting:
    actions:
      - light: "on"
      - curtain: "close"
      - noise: "low"
  
  idle:
    actions: []
```

## 验收标准
- [ ] 状态更新线程安全
- [ ] 状态发布正确
- [ ] 模式切换触发正确行为
- [ ] 支持多设备并发更新

## 相关文档
- [Room Agent 规格 - 状态模型](../docs/agents/room-agent.md#3-房间状态模型核心)