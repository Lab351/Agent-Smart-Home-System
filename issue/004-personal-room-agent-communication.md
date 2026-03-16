# Personal Agent 与 Room Agent 通信

## 优先级: P0 (Critical)

## 标签
`core-feature` `a2a-communication` `personal-agent` `room-agent`

## 概述
实现 Personal Agent 与 Room Agent 之间的核心通信流程，支持意图下发、状态查询和反馈接收。

## 背景与动机
根据 [Personal Agent 规格](../docs/agents/personal-agent.md) 和 [Room Agent 规格](../docs/agents/room-agent.md)，这是系统最核心的通信链路。

## 通信流程

```
Personal Agent           Room Agent
     │                       │
     │──── BLE Beacon ──────►│ (空间发现)
     │                       │
     │──── MQTT CONNECT ────►│
     │◄─── CONNACK ──────────┤
     │                       │
     │──── SUBSCRIBE state ──►│
     │                       │
     │──── PUBLISH control ──►│ (意图下发)
     │                       │
     │◄─── PUBLISH state ────┤ (状态更新)
     │                       │
```

## 任务清单

### Personal Agent 侧
- [ ] 空间绑定后建立 MQTT 连接
- [ ] 订阅房间状态主题
- [ ] 发送控制命令
- [ ] 发送能力查询请求
- [ ] 接收状态更新
- [ ] 接收能力描述响应
- [ ] 处理执行结果反馈

### Room Agent 侧
- [ ] 接受 Personal Agent 连接
- [ ] 处理控制命令
- [ ] 处理能力查询请求
- [ ] 发布状态更新
- [ ] 发布能力描述
- [ ] 发送心跳

### 消息类型
- [ ] **控制消息**
  ```json
  // Topic: room/{room_id}/agent/{agent_id}/control
  {
    "message_id": "uuid",
    "timestamp": "2024-01-15T10:30:00Z",
    "source_agent": "personal-agent-user1",
    "target_device": "light_1",
    "action": "on",
    "parameters": {"brightness": 80}
  }
  ```

- [ ] **状态消息**
  ```json
  // Topic: room/{room_id}/agent/{agent_id}/state
  {
    "message_id": "uuid",
    "timestamp": "2024-01-15T10:30:01Z",
    "agent_id": "room-agent-1",
    "room_state": {
      "mode": "idle",
      "occupancy": true,
      "devices": {...}
    }
  }
  ```

- [ ] **能力查询/响应**
  ```json
  // Request: room/{room_id}/agent/{agent_id}/describe
  {
    "message_id": "uuid",
    "query_type": "capabilities"
  }
  
  // Response: room/{room_id}/agent/{agent_id}/description
  {
    "agent_type": "room",
    "room_capability": {
      "supported_modes": ["idle", "sleep", "meeting"],
      "device_types": ["light", "curtain", "ac"]
    }
  }
  ```

## 文件位置
- `room-agent/core/room_agent/mqtt/` - Room Agent MQTT 处理
- `watch-agent/src/services/` - Personal Agent MQTT 处理

## 验收标准
- [ ] Personal Agent 可成功连接 Room Agent
- [ ] 控制命令正确送达
- [ ] 状态更新正确接收
- [ ] 能力查询正常工作
- [ ] 心跳机制正常

## 测试场景
1. 用户进入房间 → 自动连接
2. 用户说"打开灯" → 命令下发 → 设备响应
3. 房间状态变化 → Personal Agent 收到更新

## 相关文档
- [Personal Agent 规格](../docs/agents/personal-agent.md)
- [Room Agent 规格](../docs/agents/room-agent.md)
- [通信协议规范](../docs/communication.md)