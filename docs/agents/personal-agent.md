# Personal Agent (随身 Agent) 技术规格

## OpenSpec 规范化描述

### Requirement: Intent Authority
The Personal Agent SHALL be the single source of truth for user intent.

#### Scenario: User intent capture
- **GIVEN** a user issues a voice command
- **WHEN** the Personal Agent parses the command
- **THEN** the structured intent is produced and treated as authoritative

### Requirement: Dynamic Room Binding
The Personal Agent SHALL bind to the current room's Room Agent based on spatial scanning.

#### Scenario: Entering a room
- **GIVEN** the user enters a new room with a stronger beacon signal
- **WHEN** the Personal Agent detects the new room
- **THEN** it switches binding to the new room's Room Agent

### Requirement: No Direct Device Control
The Personal Agent SHALL NOT directly control devices and SHALL only send intents to Room or Central Agents.

#### Scenario: Device control request
- **GIVEN** the user requests "turn on the light"
- **WHEN** the Personal Agent processes the request
- **THEN** it sends a control intent to the Room Agent rather than controlling the device directly

## 1. 角色定义

Personal Agent（PA）是代表用户个体的智能体，负责：
- **用户意图理解** - 自然语言/语音/手势输入的解析
- **个人上下文维护** - 用户状态、偏好、历史
- **近场空间发现** - 通过 BLE Beacon 确定当前位置
- **动态绑定** - 自动连接到所在房间的 Room Agent
- **决策发起** - 向 Room/Central Agent 发送意图请求

**核心定位**: Personal Agent 是"用户意图与偏好的唯一权威源"（Single Source of Truth for User Intent）

## 2. 设计目标

| 目标 | 描述 | 优先级 |
|------|------|--------|
| 以人为中心 | 所有行为由用户意图触发 | P0 |
| 低侵入性 | 运行于手机、手表等随身设备 | P0 |
| 空间无关性 | 不绑定固定房间或设备 | P0 |
| 弱 Skill 依赖 | 避免技能爆炸，采用语义驱动 | P1 |
| 实时感知 | 支持近场空间动态发现 | P0 |
| 隐私优先 | 个人数据优先本地处理 | P1 |

## 3. 功能范围

### 3.1 用户意图理解

**输入形式**:
- 自然语言（语音/文本）
- 触发式指令（按钮、快捷操作）
- 隐式信号（时间、行为模式）

**核心能力**:
1. **意图分类** (Intent Classification)
   - 设备控制: "打开灯"
   - 环境调节: "有点热"
   - 场景激活: "我要休息了"
   - 信息查询: "现在室温多少"

2. **参数抽取** (Slot Filling)
   - 目标设备: "客厅的灯" → device=ceiling_light, room=livingroom
   - 动作参数: "亮度调到50%" → brightness=50
   - 约束条件: "轻柔一点" → volume=low

3. **模糊意图建模**
   - 示例: "有点吵" → {intent: reduce_noise, constraints: {noise: "low"}}
   - 示例: "我要休息一下" → {intent: rest, mode: sleep}

**输出结构**:
```json
{
  "intent": "sleep",
  "confidence": 0.87,
  "constraints": {
    "light": "off",
    "noise": "minimum",
    "temperature": "comfortable"
  },
  "context": {
    "room": "bedroom",
    "time": "2024-01-15T22:30:00Z",
    "user_state": "fatigued"
  }
}
```

### 3.2 个人上下文建模

**上下文维度**:

| 维度 | 示例 | 用途 |
|------|------|------|
| 身份信息 | user_id: "user1", role: "admin" | 权限控制 |
| 状态信息 | fatigue: "high", activity: "meeting" | 意图理解 |
| 偏好信息 | light: "warm", temp: 24°C | 个性化 |
| 时间上下文 | workday/weekend, day/night | 行为预测 |
| 历史摘要 | last_action: "sleep_mode" | 连贯性 |

**存储策略**:
- 本地优先存储（SQLite/Encrypted Preferences）
- 可选同步到 Central Agent（用户授权）
- 敏感数据加密存储

### 3.3 近场空间发现

**感知技术**:

| 技术 | 精度 | 功耗 | 状态 |
|------|------|------|------|
| BLE Beacon | 房间级 | 低 | ✅ 必需 |
| UWB | 亚米级 | 中 | ⏍ 可选 |
| Wi-Fi RTT | 米级 | 中 | ⏍ 可选 |

**Beacon 扫描参数**:
```yaml
beacon_scan:
  uuid: "01234567-89AB-CDEF-0123456789ABCDEF"
  rssi_threshold: -70  # dBm
  hysteresis: 5        # dB
  scan_interval: 1     # second
  scan_window: 100     # ms
```

**空间亲和度计算**:
```python
def calculate_proximity_score(beacons):
    """
    Input: List of detected beacons with RSSI
    Output: Score for each room (0-1)

    Algorithm:
    1. Filter by RSSI threshold
    2. Apply user preference weighting (e.g., bedroom preferred at night)
    3. Apply temporal hysteresis (prevent rapid switching)
    """
    scores = {}
    for beacon in beacons:
        if beacon.rssi > RSSI_THRESHOLD:
            room = ROOM_MAP[beacon.major]
            base_score = normalize_rssi(beacon.rssi)
            score = apply_hysteresis(room, base_score)
            scores[room] = score
    return scores
```

### 3.4 动态绑定机制

**绑定逻辑**:
1. 扫描所有可见 Beacon
2. 计算空间亲和度
3. 选择最高分房间作为主空间
4. 通过 Beacon Registry API 查询该房间的 Room Agent
5. 建立 MQTT 连接
6. 订阅状态主题

**绑定输出**:
```json
{
  "active_room": "bedroom",
  "room_agent": {
    "host": "192.168.1.100",
    "mqtt_port": 1883,
    "agent_id": "room-agent-bedroom"
  },
  "candidates": [
    {"room": "bedroom", "score": 0.82, "rssi": -55},
    {"room": "livingroom", "score": 0.41, "rssi": -75}
  ],
  "binding_confidence": 0.87
}
```

**切换条件**:
- 新房间分数 > 当前房间分数 + 滞后阈值
- 当前 Room Agent 连续心跳失败
- 用户手动切换房间

### 3.5 决策发起

**原则**: Personal Agent 不执行动作，仅发起决策请求

**请求格式**:
```json
{
  "message_id": "uuid-v4",
  "timestamp": "2024-01-15T22:30:00Z",
  "source_agent": "personal-agent-user1",
  "intent": {
    "action": "set_mode",
    "mode": "sleep",
    "confidence": 0.92
  },
  "personal_context": {
    "user_id": "user1",
    "fatigue": "high",
    "time": "night"
  },
  "constraints": {
    "light": "off",
    "noise": "minimum",
    "temperature": "comfortable"
  }
}
```

**下发对象**:
- **主 Room Agent** (优先): 单房间场景
- **Central Agent**: 跨房间场景（如"离家模式"）
- **两者**: 需要仲裁的场景（如冲突检测）

### 3.6 用户反馈与确认

**反馈类型**:

| 类型 | 触发条件 | 示例 |
|------|---------|------|
| 执行成功 | 操作完成 | "已为您打开客厅灯" |
| 执行失败 | 设备离线/错误 | "设备无响应，请检查" |
| 降级执行 | 策略限制 | "已为您播放轻柔音乐"（音量降低） |
| 需要确认 | 重大操作 | "确定要开启离家模式吗？" |
| 冲突提示 | 多用户冲突 | "用户A正在使用，稍后重试？" |

**确认方式**:
- 显式确认: 语音/按钮确认
- 隐式确认: 短时间内无否定即执行
- 自动降级: 根据策略自动调整

## 4. 责任边界

### 4.1 必须做

| 功能 | 描述 |
|------|------|
| 用户意图理解 | 解析语音/文本/手势输入 |
| 个人上下文维护 | 用户状态、偏好、历史 |
| 空间发现与绑定 | Beacon 扫描、Beacon Registry API 查询、MQTT 连接 |
| 决策发起 | 向 Room/Central Agent 发送意图 |

### 4.2 绝不做

| 功能 | 理由 |
|------|------|
| 设备控制 | Room Agent 的职责 |
| 设备状态维护 | Room Agent 的职责 |
| 空间级规则执行 | Room Agent 的职责 |
| 跨用户冲突仲裁 | Central Agent 的职责 |

## 5. 对外接口

### 5.1 输入

| 来源 | 数据类型 | 示例 |
|------|---------|------|
| 用户输入 | 语音/文本/UI | "打开灯" |
| Beacon | BLE 广播 | UUID/Major/Minor/RSSI |
| Room Agent | MQTT 消息 | 状态更新、执行结果 |
| Central Agent | MQTT 消息 | 全局状态、仲裁结果 |

### 5.2 输出

| 目标 | 数据类型 | 示例 |
|------|---------|------|
| Room Agent | MQTT 消息 | 意图请求、查询 |
| Central Agent | MQTT 消息 | 仲裁请求、状态订阅 |
| 用户 | 语音/UI | 反馈、确认 |

### 5.3 订阅主题

```
room/{room_id}/agent/{room_agent_id}/state
room/{room_id}/agent/{room_agent_id}/description
home/state
home/policy
home/arbitration/response/{request_id}
```

### 5.4 发布主题

```
room/{room_id}/agent/{room_agent_id}/control
room/{room_id}/agent/{room_agent_id}/describe
home/arbitration
```

## 6. 非功能性需求

### 6.1 实时性

| 操作 | 目标延迟 | 测量方法 |
|------|---------|---------|
| 意图解析 | < 200ms | 输入到输出 JSON |
| 空间绑定更新 | < 1s | Beacon 变化到绑定切换 |
| 反馈显示 | < 500ms | 收到状态到用户通知 |

### 6.2 能耗

| 场景 | 功耗目标 | 优化策略 |
|------|---------|---------|
| 前台运行 | < 5% CPU/小时 | 按需扫描 |
| 后台运行 | < 2% CPU/小时 | 降低扫描频率 |
| BLE 扫描 | 可配置 | 动态调整间隔 |

### 6.3 隐私与安全

- **本地意图解析**: 优先使用本地 NLP 模型
- **端到端加密**: 可选的 MQTT TLS
- **数据共享控制**: 用户可授权粒度（无/摘要/完整）

## 7. 运行形态

| 平台 | 支持状态 | 备注 |
|------|---------|------|
| Android | ✅ 计划 | Kotlin/Flutter |
| iOS | ✅ 计划 | Swift/SwiftUI |
| Android Wear | ⏍ 可选 | 简化版 UI |
| HarmonyOS | ⏍ 可选 | 中国市场 |
| ESP32 + BLE | ⏍ 概念验证 | 受限版，仅基础功能 |

## 8. 配置示例

```yaml
agent:
  id: "personal-agent-user1"
  user_id: "user1"
  version: "1.0.0"

beacon:
  uuid: "01234567-89AB-CDEF-0123456789ABCDEF"
  scan_interval: 1
  rssi_threshold: -70
  hysteresis: 5

intent:
  engine: "local"  # local, cloud, hybrid
  language: "zh-CN"
  fallback_to_cloud: true

mqtt:
  qos: 1
  keep_alive: 60
  auto_reconnect: true
  reconnect_delay: 1

preferences:
  default_room_mode:
    night: "sleep"
    workday_morning: "away"
  preferred_devices:
    livingroom: "ceiling_light"
    bedroom: "bedside_lamp"

privacy:
  local_processing: true
  sync_to_cloud: false
  share_analytics: false
```

## 9. 状态机

```
┌──────────┐
│  INIT    │
└────┬─────┘
     │
     ▼
┌──────────┐
│ SCANNING │ ◄─────┐
└────┬─────┘       │
     │             │
     ▼             │ Refresh
┌──────────┐       │
│ BINDING  │       │
└────┬─────┘       │
     │             │
     ▼             │
┌──────────┐       │
│ BOUND    │ ──────┘
└────┬─────┘
     │
     ├─► Intent Received
     │
     ▼
┌──────────┐
│ PARSING  │
└────┬─────┘
     │
     ▼
┌──────────┐
│SENDING   │
└────┬─────┘
     │
     ▼
┌──────────┐
│ WAITING  │
└────┬─────┘
     │
     ├─► Success → NOTIFY USER
     ├─► Failure → SHOW ERROR
     └─► Arbitration → WAITING
```

---

**相关文档**:
- [Room Agent 技术规格](./room-agent.md)
- [Central Agent 技术规格](./central-agent.md)
- [通信协议](../communication.md)
