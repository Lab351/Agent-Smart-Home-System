# watch-agent 与 shared/ 模块协议一致性说明

## 概述

本文档说明 watch-agent（快应用 JavaScript）与 shared/ 模块（Python）之间的消息格式一致性，确保不同技术栈的 Agent 能够顺畅通信。

## 消息格式对比

### 1. ControlMessage（控制消息）

#### Python (shared/models/mqtt_messages.py)
```python
class ControlMessage(BaseModel):
    message_id: str
    timestamp: str  # ISO 8601 格式
    source_agent: str
    target_device: str
    action: str
    parameters: Dict[str, Any] = {}
    correlation_id: Optional[str] = None
```

#### JavaScript (watch-agent/src/services/ControlService.js)
```javascript
const message = {
  message_id: this.generateUUID(),        // ✅ 一致
  timestamp: new Date().toISOString(),    // ✅ ISO 8601 格式
  source_agent: `watch-${config.agent.userId}`,  // ✅ 一致
  target_device: target,                  // ✅ 一致
  action: action,                         // ✅ 一致
  parameters: parameters                  // ✅ 一致
}
```

**一致性**: ✅ 完全一致

---

### 2. Topic 格式

#### Python (shared/mqtt/topic_manager.py)
```python
# 控制消息 Topic
control_topic = "room/{room_id}/agent/{agent_id}/control"

# 状态消息 Topic
state_topic = "room/{room_id}/agent/{agent_id}/state"

# 描述消息 Topic
describe_topic = "room/{room_id}/agent/{agent_id}/describe"
description_topic = "room/{room_id}/agent/{agent_id}/description"
```

#### JavaScript (watch-agent/src/services/ControlService.js)
```javascript
// 控制消息 Topic
const topic = `room/${roomId}/agent/${agentId}/control`

// 状态消息 Topic
const topic = `room/${roomId}/agent/${agentId}/state`

// 描述消息 Topic
const topic = `room/${roomId}/agent/${agentId}/describe`
const topic = `room/${roomId}/agent/${agentId}/description`
```

**一致性**: ✅ 完全一致

---

## QoS 策略对比

### Python (shared/mqtt/topic_manager.py)
| Topic 类型 | QoS | 理由 |
|-----------|-----|------|
| control | 1 | 命令不能丢失 |
| state | 0 | 最新状态足够 |
| describe | 1 | 必须收到响应 |
| description | 1 | 响应不能丢失 |
| heartbeat | 0 | 周期性，最新足够 |

### JavaScript (watch-agent/src/services/mqtt-service.js)
```javascript
// PUBLISH packet 使用 QoS 0
buildPublishPacket(topic, payload) {
  const packet = [
    0x30,  // PUBLISH packet type (QoS 0, no retain, no duplicate)
    ...remainingLength,
    // ...
  ]
}

// SUBSCRIBE packet 使用 QoS 0
buildSubscribePacket(topic) {
  const packet = [
    0x82,  // SUBSCRIBE packet type
    ...remainingLength,
    // ...
    0x00  // QoS 0
  ]
}
```

**注意事项**: ⚠️ watch-agent 当前所有消息都使用 QoS 0，建议根据消息类型调整 QoS 级别。

---

## 消息字段说明

### 必需字段

| 字段 | 类型 | 说明 | 示例 |
|------|------|------|------|
| message_id | string | UUID v4 格式 | `"550e8400-e29b-41d4-a716-446655440000"` |
| timestamp | string | ISO 8601 格式 | `"2024-01-15T10:30:00Z"` |
| source_agent | string | 发送方 Agent ID | `"watch-user1"` |
| target_device | string | 目标设备 ID | `"light_1"` |
| action | string | 动作 | `"turn_on"`, `"turn_off"` |
| parameters | object | 参数对象 | `{"brightness": 80}` |

### 可选字段

| 字段 | 类型 | 说明 | 示例 |
|------|------|------|------|
| correlation_id | string | 关联 ID | `"req-123"` |

---

## 设备 ID 和动作映射

### 设备别名（IntentService.js）

| 中文 | 英文 ID |
|------|---------|
| 灯、吊灯、顶灯 | `light`, `ceiling_light` |
| 音乐、音响 | `speaker` |
| 空调、冷气 | `ac` |
| 风扇 | `fan` |
| 窗帘 | `curtain` |
| 电视 | `tv` |

### 动作映射（IntentService.js）

| 中文 | 英文 ID |
|------|---------|
| 打开、开启、开 | `turn_on` |
| 关闭、关掉、关 | `turn_off` |
| 调高、调低 | `brightness_up`, `brightness_down` |
| 播放、暂停 | `play`, `pause` |

---

## 房间 ID 映射

| 中文 | 英文 ID |
|------|---------|
| 客厅 | `livingroom` |
| 卧室 | `bedroom` |
| 书房 | `study` |
| 厨房 | `kitchen` |
| 浴室、卫生间 | `bathroom` |

---

## 通信流程

### 正常控制流程

```
1. 用户语音输入
   ↓
2. ASR 识别文本
   ↓
3. IntentService 解析意图
   {device: "light", action: "turn_on", room: "livingroom"}
   ↓
4. RouterService 路由决策
   → Room Agent 或 Home Agent
   ↓
5. ControlService 发送 MQTT 消息
   Topic: room/livingroom/agent/room-agent-livingroom/control
   Payload: {message_id, timestamp, source_agent, target_device, action, parameters}
   ↓
6. Room Agent 接收并执行
   ↓
7. Room Agent 发布状态更新
   Topic: room/livingroom/agent/room-agent-livingroom/state
   ↓
8. Personal Agent 接收状态更新
   ↓
9. 用户看到反馈
```

---

## 测试验证

### 测试命令示例

```javascript
// 发送控制命令
await controlService.sendControl(
  'livingroom',      // room_id
  'ceiling_light',   // target_device
  'turn_on',         // action
  { brightness: 80 } // parameters
)
```

**生成的 MQTT 消息**:
```json
{
  "message_id": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2024-01-15T10:30:00Z",
  "source_agent": "watch-user1",
  "target_device": "ceiling_light",
  "action": "turn_on",
  "parameters": {
    "brightness": 80
  }
}
```

**Topic**: `room/livingroom/agent/room-agent-livingroom/control`

---

## 已知限制

### 1. QoS 级别

**问题**: watch-agent 当前所有消息都使用 QoS 0

**影响**: 
- 控制命令可能丢失（建议使用 QoS 1）
- 状态更新使用 QoS 0 是合适的

**解决方案**: 修改 mqtt-service.js 中的 buildPublishPacket 和 buildSubscribePacket 方法，根据消息类型设置不同的 QoS 级别

### 2. 消息确认

**问题**: 当前没有实现消息确认机制

**影响**: 无法确保消息被 Room Agent 接收和处理

**解决方案**: 实现基于 correlation_id 的请求-响应模式

---

## 兼容性保证

为确保 watch-agent 与其他 Agent 通信无障碍，请遵循以下原则：

1. ✅ **消息格式**: 严格遵循 shared/models/mqtt_messages.py 定义的格式
2. ✅ **Topic 格式**: 严格遵循 shared/mqtt/topic_manager.py 定义的格式
3. ⚠️ **QoS 策略**: 建议根据消息类型调整 QoS 级别
4. ✅ **字段命名**: 使用 snake_case（Python 和 JavaScript 通用）
5. ✅ **时间戳格式**: 使用 ISO 8601 格式
6. ✅ **UUID 格式**: 使用 UUID v4 格式

---

## 总结

✅ **消息格式完全一致**: watch-agent 发送的消息可以被 shared/ 模块的 Agent 正确解析

✅ **Topic 格式完全一致**: 所有 Agent 使用相同的 Topic 命名规范

⚠️ **QoS 策略需要优化**: 建议根据消息类型调整 QoS 级别

✅ **通信流程完整**: 从语音输入到设备控制的完整链路已实现

---

**文档版本**: v1.0  
**最后更新**: 2024-01-15  
**维护者**: kunkun