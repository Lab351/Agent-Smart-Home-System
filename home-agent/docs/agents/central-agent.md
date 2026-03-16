# Central Agent (中央 Agent) 技术规格

## 1. 角色定位

Central Agent 是智能家居 Agent 系统中的 **全局协调智能体**，负责：
- 维护跨空间、跨用户、跨时间尺度的全局状态与约束
- 在必要时对下级 Agent 的决策进行协调或仲裁
- 作为系统层面的 **规则与一致性维护者**（Global Consistency Keeper）

**核心定位**:
- Central Agent **不直接感知用户**、**不直接控制设备**
- 它是"被动守护者"，而非"主动指挥者"

## 2. 设计动机

### 2.1 问题陈述

在仅由 Personal Agent + Room Agent 构成的系统中，天然存在：

| 问题 | 描述 | 影响 |
|------|------|------|
| 多 Room Agent 缺乏协调 | 各房间独立运行 | 无法实现跨房间场景 |
| 多用户意图冲突 | A想开灯，B想关灯 | 无仲裁机制 |
| 全局约束无归属 | 安全、能耗、模式规则 | 无明确归属 |
| 系统行为割裂 | 随空间变化而变化 | 缺乏一致性 |

### 2.2 设计目标

**在不破坏 Room Agent 自治的前提下，引入全局理性与长期一致性**

## 3. 核心设计原则

| 原则 | 描述 | 体现 |
|------|------|------|
| **逻辑中心化，执行去中心化** | 维护全局一致性，但不直接控制 | 通过策略引导 |
| **软约束优先于硬控制** | 规则裁剪，而非强制拒绝 | 降级执行 |
| **事件驱动，而非轮询控制** | 响应式架构，降低资源消耗 | 订阅/发布模式 |
| **默认不介入，仅在必要时介入** | 信任 Room Agent 自治 | 冲突/违规时才介入 |
| **规则 > 状态 > 行为** | 声明式策略，而非命令式 | 策略引擎 |

## 4. 功能范围

### 4.1 全局状态建模

**Central Agent 维护系统级抽象状态，而非具体设备状态**

#### 状态类型

| 状态 | 值域 | 更新频率 |
|------|------|---------|
| 家庭模式 | home/away/sleep/vacation | 低频 |
| 是否有人在家 | bool | 中频 |
| 当前活跃用户集合 | List[user_id] | 中频 |
| 全局时间上下文 | workday/weekend/day/night | 静态/低频 |
| 系统风险状态 | normal/warning/critical | 低频 |

#### 状态特点

- **低频更新**: 非实时，秒级/分钟级即可
- **可被订阅**: Room/Personal Agent 可订阅
- **不要求实时精确**: 最终一致性即可

#### 全局状态示例

```json
{
  "home_id": "home-001",
  "mode": "home",
  "occupancy": {
    "anyone_home": true,
    "active_users": ["user1", "user2"],
    "last_change": "2024-01-15T22:30:00Z"
  },
  "temporal_context": {
    "day_type": "workday",
    "time_period": "night",
    "timezone": "Asia/Shanghai"
  },
  "risk_level": "normal",
  "timestamp": "2024-01-15T22:30:00Z"
}
```

### 4.2 全局策略与规则管理

#### 策略示例

| 策略 | 规则 | 触发条件 |
|------|------|---------|
| 夜间节能 | light_max=low, noise_max=minimum | mode=sleep |
| 离家自动化 | 所有设备关闭，安防开启 | mode=away |
| 儿童限制 | 锁定成人内容，限制音量 | user.role=child |
| 安全优先 | 火警时开所有灯，解锁门 | risk=critical |

#### 策略形态

**声明式规则**:
```yaml
policies:
  sleep_mode:
    light_max: low
    noise_max: minimum
    interruptible: false
    priority: 80

  away_mode:
    all_devices: off
    security: armed
    priority: 90

  child_protection:
    content_filter: enabled
    volume_max: 50
    priority: 70
```

**特点**:
- ✅ 声明式、可解释
- ✅ 不绑定具体设备
- ✅ 可组合、可覆盖

### 4.3 跨 Agent 协调

#### 协调对象

| 对象 | 示例 | 优先级 |
|------|------|--------|
| Personal Agent ↔ Room Agent | Sleep 模式下禁止播放音乐 | P0 |
| 多 Personal Agent 冲突 | A 开灯，B 关灯 | P0 |
| Room Agent ↔ Room Agent | (不做，家居场景无强需求) | - |

#### 协调方式

1. **优先级排序**: 基于用户角色
   ```yaml
   users:
     - user_id: "admin"
       priority: 100
     - user_id: "adult"
       priority: 80
     - user_id: "child"
       priority: 50
   ```

2. **规则裁剪（降级）**: 修改参数而非拒绝
   ```python
   # 用户请求: volume=80
   # 策略限制: noise_max=minimum
   # 降级结果: volume=20
   ```

3. **决策建议**: (被动监听模式不支持)

### 4.4 决策仲裁

#### 触发条件

| 条件 | 示例 |
|------|------|
| 多用户意图冲突 | A: "开灯", B: "关灯" |
| 多空间资源竞争 | 两个房间争用同一设备 |
| 意图违反全局规则 | Sleep 模式下播放音乐 |

#### 仲裁输出

```json
{
  "request_id": "uuid-v4",
  "decision": "partial_accept",
  "reason": "sleep_mode_active",
  "suggestion": "delay_execution",
  "modified_action": {
    "original": {"action": "music.play", "volume": 80},
    "modified": {"action": "music.play", "volume": 20}
  }
}
```

#### 决策类型

| 类型 | 描述 | 示例 |
|------|------|------|
| `accept` | 完全接受 | 正常执行 |
| `reject` | 完全拒绝 | 违反安全规则 |
| `partial_accept` | 降级执行 | Sleep 模式降低音量 |
| `defer` | 延迟执行 | 设备忙碌，稍后重试 |

### 4.5 系统级事件管理

#### 事件类型

| 事件 | 示例动作 |
|------|---------|
| 安全事件 | 火警、入侵检测 |
| 异常状态 | 设备离线、温度异常 |
| 全局模式切换 | Home → Away → Sleep |

#### 广播机制

Central Agent 可**主动向下广播状态变化**，但**不下发具体控制指令**:

```json
// ✅ 正确: 广播状态变化
{
  "event_type": "mode_switch",
  "from": "home",
  "to": "sleep",
  "triggered_by": "schedule"
}

// ❌ 错误: 下发控制指令
{
  "command": "turn_off_all_lights"  // 不应该这样做
}
```

**原则**: Central Agent 说"现在是什么状态"，Room Agent 决定"该做什么"

## 5. 责任边界

### 5.1 必须负责

| 功能 | 描述 |
|------|------|
| 全局状态维护 | Home mode, occupancy, risk level |
| 全局策略与规则 | Declarative policies |
| 冲突仲裁 | Multi-user conflicts |
| 跨空间一致性 | Coordinating multiple rooms |

### 5.2 明确不负责

| 功能 | 理由 | 归属 |
|------|------|------|
| 用户意图理解 | 不是用户的直接接口 | Personal Agent |
| 近场感知/Beacon | 无需空间感知 | Personal Agent |
| 设备控制 | 破坏 Room Agent 自治 | Room Agent |
| 房间内即时决策 | 本地决策更高效 | Room Agent |

## 6. 与其他 Agent 的关系

### 6.1 与 Personal Agent

**Personal Agent → Central Agent**:
- 订阅全局状态（`home/state`）
- 订阅策略更新（`home/policy`）
- 请求仲裁（`home/arbitration`）

**Central Agent → Personal Agent**:
- 推送全局状态变化
- 返回仲裁结果

### 6.2 与 Room Agent

**Room Agent → Central Agent**:
- 上报房间状态摘要（低频）
- 请求策略检查
- 请求仲裁

**Central Agent → Room Agent**:
- 推送策略更新
- 返回仲裁结果
- 广播系统事件

## 7. 非功能性需求

### 7.1 稳定性

| 要求 | 保障机制 |
|------|---------|
| 单点失效不影响 Room Agent | Room Agent 本地自治 |
| 降级运行 | Central Agent 离线时 Room Agent 继续服务 |

### 7.2 一致性

| 要求 | 策略 |
|------|------|
| 全局状态最终一致 | 不要求强一致 |
| Room Agent 可缓存策略 | 短期内可离线运行 |

### 7.3 可扩展性

| 维度 | 支持 |
|------|------|
| 新增规则 | 配置文件，无需重写代码 |
| 多用户家庭 | 用户角色 + 优先级 |
| 多房间 | 订阅所有 Room Agent 状态 |

## 8. 部署形态

| 形态 | 平台 | 适用场景 |
|------|------|---------|
| 家庭中控节点 | NAS/Mini PC/Jetson | 推荐 |
| 云端逻辑实例 | 云 VM | 远程访问 |
| 与 Room Agent 共部署 | 同一设备 | 小户型（逻辑隔离） |

## 9. 配置示例

```yaml
agent:
  id: "central-agent-1"
  home_id: "home-001"
  version: "1.0.0"

mqtt:
  brokers:
    - room_id: "livingroom"
      host: "192.168.1.100"
      port: 1883
    - room_id: "bedroom"
      host: "192.168.1.101"
      port: 1883
  qos_default: 1

global_state:
  storage_backend: "sqlite"  # or postgresql, redis
  state_file: "/var/lib/central-agent/state.db"
  update_interval: 60

policies:
  rules_file: "/etc/central-agent/policies.yaml"
  reload_on_change: true

arbitration:
  default_timeout: 5
  max_retries: 3
  decision_log: "/var/log/central-agent/arbitration.log"

users:
  - user_id: "user1"
    role: "admin"
    priority: 100
  - user_id: "user2"
    role: "adult"
    priority: 80
  - user_id: "child1"
    role: "child"
    priority: 50

home_modes:
  - name: "home"
    default: true
  - name: "away"
    auto_trigger: true
    trigger_condition: "no_users_home_for_10min"
  - name: "sleep"
    schedule: "22:00-07:00"
  - name: "vacation"
    manual_only: true
```

## 10. 与传统"中控"的本质区别

| 维度 | 传统中控 | Central Agent |
|------|---------|---------------|
| 控制哲学 | 中心化命令控制 | 逻辑中心化，执行去中心化 |
| 设备控制 | 直接控制所有设备 | 不直接控制设备 |
| 用户交互 | 直接接收用户命令 | 被动监听，不直接交互 |
| 决策制定 | 做所有决策 | 尊重 Room Agent 自治 |
| 失效影响 | 单点故障，全系统瘫痪 | 优雅降级，Room Agent 继续运行 |
| 耦合度 | 与设备强耦合 | 松耦合，规则驱动 |
| 范围 | 控制一切 | 仅全局状态与策略 |

**核心差异**:
- 传统中控是 **"主动指挥者"** (Active Commander)
- Central Agent 是 **"被动守护者"** (Passive Guardian)

## 11. 事件流程示例

### 场景：多用户灯光冲突

```
T0: User A (卧室) → Personal Agent A: "打开卧室灯"
    → Room Agent (卧室): 请求仲裁

T1: Central Agent: 检查 User B 正在卧室睡觉
    → 返回: partial_accept (light=bedside_lamp, brightness=20%)

T2: Room Agent (卧室): 执行降级命令
    → 状态更新: bedside_lamp=on, brightness=20%

T3: Personal Agent A: 反馈用户
    → "已为您打开床头灯（亮度20%）"
```

---

**相关文档**:
- [Personal Agent 技术规格](./personal-agent.md)
- [Room Agent 技术规格](./room-agent.md)
- [通信协议](../communication.md)
