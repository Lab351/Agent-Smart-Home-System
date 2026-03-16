# Central Agent 通信集成

## 优先级: P1 (High)

## 标签
`core-feature` `central-agent` `a2a-communication`

## 概述
实现 Room Agent 与 Central Agent 之间的通信，支持全局状态同步、策略更新和仲裁请求。

## 背景与动机
根据 [Central Agent 规格](../docs/agents/central-agent.md)，Central Agent 负责全局协调和冲突仲裁，需要与各 Room Agent 建立通信。

## 通信架构

```
Room Agent A    Room Agent B    Room Agent C
     │              │              │
     └──────────────┼──────────────┘
                    │
                    ▼
            ┌──────────────┐
            │    MQTT      │
            │   Broker     │
            └──────┬───────┘
                   │
                   ▼
            ┌──────────────┐
            │   Central    │
            │   Agent      │
            └──────────────┘
```

## 任务清单

### Room Agent → Central Agent
- [ ] 上报房间状态摘要（低频，如每分钟）
- [ ] 请求仲裁（冲突场景）
- [ ] 订阅全局策略更新
- [ ] 订阅全局状态变化

### Central Agent → Room Agent
- [ ] 接收状态摘要
- [ ] 处理仲裁请求
- [ ] 发布策略更新
- [ ] 广播系统事件

### 消息类型

#### 状态摘要上报
```json
// Topic: home/room_summary/{room_id}
{
  "room_id": "bedroom_01",
  "mode": "sleep",
  "occupancy": true,
  "device_count": 5,
  "active_devices": ["ac"],
  "timestamp": "2024-01-15T22:30:00Z"
}
```

#### 策略更新
```json
// Topic: home/policy
{
  "policy_name": "sleep_mode",
  "rules": {
    "light_max": "low",
    "noise_max": "minimum",
    "interruptible": false
  },
  "effective_from": "2024-01-15T22:00:00Z",
  "effective_until": "2024-01-16T07:00:00Z"
}
```

#### 全局状态
```json
// Topic: home/state
{
  "home_mode": "home",
  "active_users": ["user1", "user2"],
  "risk_level": "normal",
  "temporal_context": {
    "day_type": "workday",
    "time_period": "evening"
  }
}
```

## 文件位置
- `home-agent/core/central_agent/` - Central Agent 实现
- `room-agent/core/room_agent/mqtt/` - Room Agent Central 通信

## 配置示例

```yaml
# Room Agent 配置
central_agent:
  enabled: true
  broker:
    host: "192.168.1.200"
    port: 1883
  summary_interval: 60  # 秒
  subscribe_policy: true

# Central Agent 配置
mqtt:
  brokers:
    - room_id: "livingroom"
      host: "192.168.1.100"
      port: 1883
    - room_id: "bedroom"
      host: "192.168.1.101"
      port: 1883
```

## 验收标准
- [ ] Room Agent 可连接 Central Agent
- [ ] 状态摘要正确上报
- [ ] 策略更新正确下发
- [ ] Central Agent 离线时 Room Agent 继续工作

## 相关文档
- [Central Agent 规格](../docs/agents/central-agent.md)
- [Room Agent 规格](../docs/agents/room-agent.md)