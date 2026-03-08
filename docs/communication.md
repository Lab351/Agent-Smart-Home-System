# 通信协议规范

## 1. 协议栈概览

```
┌─────────────────────────────────────────────────────────────┐
│                    应用层 (Application)                      │
│  Personal Agent ↔ Room Agent ↔ Central Agent                │
├─────────────────────────────────────────────────────────────┤
│                    消息层 (Messaging)                        │
│  MQTT (Message Queuing Telemetry Transport)                 │
├─────────────────────────────────────────────────────────────┤
│                    发现层 (Discovery)                        │
│  HTTP API (qwen-backend Beacon Service)                     │
├─────────────────────────────────────────────────────────────┤
│                    感知层 (Perception)                       │
│  BLE Beacon (iBeacon)                                       │
└─────────────────────────────────────────────────────────────┘
```

## 2. BLE Beacon 协议（空间感知层）

### 2.1 Beacon 格式（iBeacon）

| 字段 | 大小 | 示例值 | 说明 |
|------|------|--------|------|
| UUID | 16 bytes | `01234567-89AB-CDEF-0123456789ABCDEF` | 系统标识符 |
| Major | 2 bytes | 1-255 | 房间标识符 |
| Minor | 2 bytes | 0-255 | 区域/位置标识符 |
| Measured Power | 1 byte | -59 | 1米处的 RSSI |

### 2.2 房间编号映射

| Major | 房间 | 说明 |
|-------|------|------|
| 1 | livingroom | 客厅 |
| 2 | bedroom | 卧室 |
| 3 | study | 书房 |
| 4+ | (扩展) | 预留 |

### 2.3 空间绑定算法

```python
RSSI_THRESHOLD = -70  # dBm
HYSTERESIS = 5        # dB

def determine_current_space(beacons, current_space):
    """
    1. 过滤: RSSI > threshold
    2. 选择: 最高 RSSI 的 beacon
    3. 滞后: 仅在 > current + hysteresis 时切换
    """
    filtered = [b for b in beacons if b.rssi > RSSI_THRESHOLD]
    if not filtered:
        return current_space  # 保持当前

    candidate = max(filtered, key=lambda b: b.rssi)

    if current_space:
        current_beacon = get_beacon_for_space(current_space, beacons)
        if candidate.rssi > current_beacon.rssi + HYSTERESIS:
            return candidate.space_id
        else:
            return current_space
    else:
        return candidate.space_id
```

### 2.4 Beacon 广播参数

| 参数 | 值 | 说明 |
|------|---|------|
| 广播间隔 | 1 Hz | 每秒一次 |
| 测量功率 | -59 dBm | 1米处校准值 |
| 发射功率 | 0 dBm | 平衡功耗与覆盖 |

## 3. qwen-backend Beacon API（服务发现层）

### 3.1 API 端点

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/beacon/register` | POST | 注册/更新 Beacon 信息（Room Agent 调用） |
| `/api/beacon/{beacon_id}` | GET | 查询 Beacon 信息（Personal Agent 调用） |
| `/api/beacon/{beacon_id}/heartbeat` | POST | 更新心跳 |
| `/api/beacon/list` | GET | 获取所有 Beacon 列表 |
| `/api/beacon/{beacon_id}` | DELETE | 删除 Beacon |

### 3.2 Beacon 注册（Room Agent 启动时）

**请求**:
```http
POST /api/beacon/register
Content-Type: application/json

{
  "beacon_id": "01234567-89ab-cdef-0123456789abcdef-2-0",
  "room_id": "bedroom_01",
  "agent_id": "room-agent-bedroom",
  "mqtt_broker": "192.168.1.100",
  "mqtt_ws_port": 9001,
  "capabilities": ["light", "curtain", "climate"],
  "devices": [
    {"id": "light_1", "name": "主灯", "type": "light"},
    {"id": "curtain_1", "name": "窗帘", "type": "curtain"}
  ]
}
```

**响应**:
```http
HTTP/1.1 201 Created
Content-Type: application/json

{
  "beacon_id": "01234567-89ab-cdef-0123456789abcdef-2-0",
  "room_id": "bedroom_01",
  "agent_id": "room-agent-bedroom",
  "mqtt_broker": "192.168.1.100",
  "mqtt_ws_port": 9001,
  "capabilities": ["light", "curtain", "climate"],
  "devices": [
    {"id": "light_1", "name": "主灯", "type": "light"}
  ],
  "registered_at": "2024-01-15T10:00:00Z",
  "last_heartbeat": "2024-01-15T10:00:00Z"
}
```

### 3.3 Beacon 查询（Personal Agent 发现时）

**请求**:
```http
GET /api/beacon/{beacon_id}
```

**响应**:
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "beacon_id": "01234567-89ab-cdef-0123456789abcdef-2-0",
  "room_id": "bedroom_01",
  "agent_id": "room-agent-bedroom",
  "mqtt_broker": "192.168.1.100",
  "mqtt_ws_port": 9001,
  "capabilities": ["light", "curtain", "climate"],
  "devices": [
    {"id": "light_1", "name": "主灯", "type": "light"}
  ],
  "registered_at": "2024-01-15T10:00:00Z",
  "last_heartbeat": "2024-01-15T10:30:00Z"
}
```

### 3.4 发现流程

```
1. Personal Agent 扫描 Beacon → 提取 beacon_id
2. Personal Agent 调用 GET /api/beacon/{beacon_id}
3. qwen-backend 返回 mqtt_broker、room_id、agent_id、capabilities
4. Personal Agent 使用返回的 mqtt_broker 地址建立 MQTT 连接
5. Personal Agent 订阅房间状态和设备控制主题
```

## 4. MQTT 协议（通信层）

### 4.1 Broker 拓扑

| 拓扑 | 描述 | 适用场景 |
|------|------|---------|
| 每房间独立 Broker | 每个房间一个 MQTT Broker | 推荐，隔离性好 |
| 单一中央 Broker | 全家一个 Broker | 小户型 |
| 混合模式 | 房间 Broker + 中央 Broker 联网 | 复杂场景 |

### 4.2 Topic 命名空间

```
room/{room_id}/
├── agent/{agent_id}/
│   ├── control/          # 控制命令
│   ├── state/            # 状态发布
│   ├── describe/         # 能力查询
│   ├── description/      # 能力响应
│   └── heartbeat/        # 心跳
├── robot/{robot_id}/
│   ├── control/
│   ├── state/
│   └── telemetry/
└── system/
    ├── discovery/
    └── error/

home/
├── state/                # 全局状态
├── policy/               # 策略更新
├── arbitration/          # 仲裁请求/响应
├── events/               # 系统事件
└── heartbeat/            # Central Agent 心跳
```

### 4.3 QoS 策略

| Topic 类型 | QoS | 理由 |
|-----------|-----|------|
| control | 1 | 命令不能丢失 |
| state | 0 | 最新状态足够 |
| describe | 1 | 必须收到响应 |
| description | 1 | 响应不能丢失 |
| heartbeat | 0 | 周期性，最新足够 |
| home/state | 0 | 全局状态，最新足够 |
| home/policy | 1 | 策略更新不能丢失 |
| home/arbitration | 1 | 仲裁决定必须送达 |
| home/events | 1 | 事件不能错过 |

## 5. 消息格式规范

### 5.1 通用消息头

所有消息必须包含以下字段：

```json
{
  "message_id": "uuid-v4",
  "timestamp": "2024-01-15T10:30:00Z",
  "source_agent": "agent-id",
  "version": "1.0.0"
}
```

### 5.2 控制消息

**Topic**: `room/{room_id}/agent/{agent_id}/control`

```json
{
  "message_id": "uuid-v4",
  "timestamp": "2024-01-15T10:30:00Z",
  "source_agent": "personal-agent-user1",
  "target_device": "light_1",
  "action": "on",
  "parameters": {
    "brightness": 80,
    "color_temp": 4000
  },
  "correlation_id": "optional-correlation-id"
}
```

### 5.3 状态消息

**Topic**: `room/{room_id}/agent/{agent_id}/state`

```json
{
  "message_id": "uuid-v4",
  "timestamp": "2024-01-15T10:30:01Z",
  "agent_id": "room-agent-1",
  "room_state": {
    "mode": "idle",
    "occupancy": true,
    "environment": {...},
    "devices": {...}
  },
  "agent_status": "operational"
}
```

### 5.4 Describe 请求

**Topic**: `room/{room_id}/agent/{agent_id}/describe`

```json
{
  "message_id": "uuid-v4",
  "timestamp": "2024-01-15T10:30:00Z",
  "source_agent": "personal-agent-user1",
  "query_type": "capabilities"
}
```

### 5.5 Description 响应

**Topic**: `room/{room_id}/agent/{agent_id}/description`

```json
{
  "message_id": "uuid-v4",
  "timestamp": "2024-01-15T10:30:01Z",
  "agent_id": "room-agent-1",
  "agent_type": "room",
  "version": "1.0.0",
  "room_capability": {
    "supported_modes": ["idle", "sleep", "meeting"],
    "device_types": ["light", "curtain", "ac"],
    "environment_sensing": ["temperature", "humidity", "light"]
  },
  "devices": [
    {
      "id": "light_1",
      "name": "Main Ceiling Light",
      "type": "light",
      "actions": ["on", "off", "set_brightness", "set_color_temp"],
      "state_attributes": ["brightness", "color_temp", "power_state"]
    }
  ]
}
```

### 5.6 心跳消息

**Topic**: `room/{room_id}/agent/{agent_id}/heartbeat`

```json
{
  "message_id": "uuid-v4",
  "timestamp": "2024-01-15T10:30:00Z",
  "agent_id": "room-agent-1",
  "status": "operational",
  "uptime_seconds": 3600,
  "metrics": {
    "cpu_usage": 25.5,
    "memory_usage": 45.2,
    "active_connections": 3
  }
}
```

### 5.7 全局状态消息

**Topic**: `home/state`

```json
{
  "message_id": "uuid-v4",
  "timestamp": "2024-01-15T10:30:00Z",
  "home_mode": "home",
  "active_users": ["user1", "user2"],
  "risk_level": "normal",
  "temporal_context": {
    "day_type": "workday",
    "time_period": "evening"
  }
}
```

### 5.8 策略更新消息

**Topic**: `home/policy`

```json
{
  "message_id": "uuid-v4",
  "timestamp": "2024-01-15T10:30:00Z",
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

### 5.9 仲裁请求消息

**Topic**: `home/arbitration`

```json
{
  "message_id": "uuid-v4",
  "timestamp": "2024-01-15T10:30:00Z",
  "requesting_agent": "personal-agent-user1",
  "conflicting_agents": ["personal-agent-user2"],
  "conflict_type": "multi_user_intent",
  "intent": {
    "target_device": "light_1",
    "action": "on"
  },
  "context": {
    "room_id": "bedroom",
    "current_mode": "sleep"
  }
}
```

### 5.10 仲裁响应消息

**Topic**: `home/arbitration/response/{request_id}`

```json
{
  "message_id": "uuid-v4",
  "timestamp": "2024-01-15T10:30:01Z",
  "request_id": "original-request-id",
  "decision": "partial_accept",
  "reason": "sleep_mode_active",
  "suggestion": "reduced_brightness",
  "modified_action": {
    "target_device": "light_1",
    "action": "on",
    "parameters": {
      "brightness": 20
    }
  }
}
```

### 5.11 系统事件消息

**Topic**: `home/events`

```json
{
  "message_id": "uuid-v4",
  "timestamp": "2024-01-15T10:30:00Z",
  "event_type": "mode_switch",
  "event_data": {
    "from_mode": "home",
    "to_mode": "sleep",
    "triggered_by": "schedule",
    "effective_immediately": true
  }
}
```

## 6. 通信时序

### 6.1 Personal Agent 连接流程

```
Personal Agent           qwen-backend          Room Agent
     │                         │                     │
     │◄── BLE Beacon ──────────┼─────────────────────┤
     │   (beacon_id)           │                     │
     │                         │                     │
     │──── GET /api/beacon/────►│                     │
     │     {beacon_id}          │                     │
     │                         │───── Heartbeat ────►│
     │                         │                     │
     │◄─── 200 OK ─────────────┤                     │
     │   (mqtt_broker,         │                     │
     │    room_id,             │                     │
     │    agent_id,            │                     │
     │    capabilities)        │                     │
     │                         │                     │
     │──── MQTT CONNECT ─────────────────────────────►│
     │                         │                     │
     │◄─── CONNACK ──────────────────────────────────┤
     │                         │                     │
     │──── SUBSCRIBE state/description ──────────────►│
     │                         │                     │
     │──── PUBLISH describe ─────────────────────────►│
     │                         │                     │
     │◄─── PUBLISH description ───────────────────────┤
     │     (Capabilities received)                    │
```

### 6.2 带仲裁的控制流程

```
Personal Agent    Room Agent    Central Agent    Device
     │               │                │           │
     │─ 控制 ───────►│                │           │
     │               │                │           │
     │               │─ 仲裁 ────────►│           │
     │               │                │           │
     │               │◄── 结果 ───────┤           │
     │               │                │           │
     │               │─ 控制 ────────────────────►│
     │               │                            │
     │◄── 状态 ──────┤◄── 状态 ──────────────────┤
```

## 7. 安全与认证

### 7.1 MQTT 认证

```yaml
authentication:
  mechanism: "username_password"  # or client_certificates
  username_prefix: "agent_"
  password_format: "token_based"  # JWT or shared secret
  token_expiry: 86400  # 24 hours
```

### 7.2 Topic ACL

```yaml
access_control:
  personal_agent:
    can_publish:
      - "room/{room_id}/agent/*/control"
      - "room/{room_id}/agent/*/describe"
      - "home/arbitration"
    can_subscribe:
      - "room/{room_id}/agent/*/state"
      - "room/{room_id}/agent/*/description"
      - "home/state"
      - "home/policy"

  room_agent:
    can_publish:
      - "room/{room_id}/agent/+/state"
      - "room/{room_id}/agent/+/description"
      - "room/{room_id}/agent/+/heartbeat"
      - "home/arbitration"
    can_subscribe:
      - "room/{room_id}/agent/+/control"
      - "room/{room_id}/agent/+/describe"
      - "home/policy"

  central_agent:
    can_publish:
      - "home/+"
      - "room/+/agent/+/+"  # 仅状态查询
    can_subscribe:
      - "room/+/agent/+/state"
      - "home/arbitration"
```

### 7.3 TLS 加密

```yaml
encryption:
  mqtt:
    tls_enabled: true  # Production
    tls_version: "1.3"
    certificate_validation: true
    cipher_suites:
      - "TLS_AES_128_GCM_SHA256"
      - "TLS_AES_256_GCM_SHA384"
```

## 8. 错误处理

### 8.1 错误消息格式

```json
{
  "message_id": "uuid-v4",
  "timestamp": "2024-01-15T10:30:05Z",
  "error_code": "DEVICE_TIMEOUT",
  "error_message": "Device light_1 did not respond within 5s",
  "retry_suggested": true,
  "context": {
    "device_id": "light_1",
    "action": "on",
    "timeout": 5
  }
}
```

### 8.2 错误码列表

| 错误码 | 描述 | 可重试 |
|--------|------|--------|
| `DEVICE_NOT_FOUND` | 设备不存在 | ❌ |
| `DEVICE_TIMEOUT` | 设备超时 | ✅ |
| `DEVICE_OFFLINE` | 设备离线 | ⏳ |
| `ACTION_NOT_SUPPORTED` | 不支持的操作 | ❌ |
| `INVALID_PARAMETERS` | 参数错误 | ❌ |
| `POLICY_VIOLATION` | 违反策略 | ❌ |
| `AUTHENTICATION_FAILED` | 认证失败 | ❌ |

## 9. 性能指标

| 指标 | 目标 | 测量方法 |
|------|------|---------|
| Beacon API 发现延迟 | < 200ms | HTTP 请求到响应 |
| MQTT 连接延迟 | < 200ms | CONNECT 到 CONNACK |
| 控制端到端延迟 | < 500ms | 意图到状态更新 |
| 消息吞吐量 | 100 msg/s | 每房间 |
| 心跳周期 | 30s | 定时发送 |

---

**相关文档**:
- [Personal Agent 技术规格](./agents/personal-agent.md)
- [Room Agent 技术规格](./agents/room-agent.md)
- [Central Agent 技术规格](./agents/central-agent.md)
- [系统总览](./system-overview.md)
