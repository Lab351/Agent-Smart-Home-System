# Room Agent (房间 Agent) 技术规格

## 1. 设计原则

### 1.1 核心原则

| 原则 | 描述 | 体现 |
|------|------|------|
| **Room-first** | 以物理空间为中心，而非设备或技能 | 所有状态围绕 Room State |
| **State > Skill** | 维护房间状态，而非提供大量接口 | 统一的 Room State 对象 |
| **最小对外接口** | 只暴露跨 Agent 协作的必要能力 | 3个必选接口 |
| **实现自由，接口稳定** | 内部可替换，对外行为稳定 | 行为不要求 Skill 形式 |

### 1.2 设计目标

- **状态聚合**: 统一管理房间内设备、传感器、子 Agent 状态
- **局部决策**: 根据房间模式和规则自主决策
- **对外汇报**: 向上 Agent 提供房间状态和能力摘要
- **指令执行**: 将高层决策转化为具体设备动作

## 2. 系统定位

### 2.1 定义

Room Agent 是负责对一个物理房间或功能空间进行：
- **状态聚合** (State Aggregation)
- **局部决策** (Local Decision Making)
- **对外汇报** (Status Reporting)
- **指令执行** (Command Execution)

的常驻 Agent 实例。

### 2.2 边界

| Room Agent 负责 | Room Agent 不负责 |
|----------------|------------------|
| ✅ 管理房间内设备、传感器、子 Agent | ❌ 全局任务规划 |
| ✅ 决定"房间当前是什么状态" | ❌ 直接操作底层硬件驱动 |
| ✅ 房间级别的规则执行 | ❌ 跨用户冲突仲裁 |
| ✅ 向上汇报房间状态 | ❌ Personal Agent 意图理解 |

## 3. 房间状态模型（核心）

### 3.1 Room State 对象

**Room Agent 必须维护一个统一的 Room State，作为唯一可信源（Single Source of Truth）**

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

### 3.2 状态字段说明

| 字段 | 类型 | 说明 | 更新频率 |
|------|------|------|---------|
| room_id | string | 房间唯一标识 | 静态 |
| mode | enum | 房间模式: idle/sleep/meeting/custom | 低频 |
| occupancy | bool | 是否有人 | 中频 |
| environment | object | 环境状态（温度、湿度、光照） | 高频 |
| devices | object | 设备状态快照 | 高频 |
| agents | object | 子 Agent 状态 | 中频 |
| timestamp | int64 | 最后更新时间 | 每次 |
| version | int | 状态版本号（用于冲突检测） | 每次 |

### 3.3 状态更新来源

1. **设备 Agent 上报**: 设备状态变化推送
2. **传感器数据**: 定期轮询或事件触发
3. **上层 Agent 指令**: Personal/Central Agent 的控制命令
4. **内部推断**: 基于规则或状态机推断

### 3.4 状态一致性保障

```python
class RoomState:
    def __init__(self):
        self.state = {}
        self.version = 0
        self.lock = asyncio.Lock()

    async def update(self, updates):
        async with self.lock:
            old_state = self.state.copy()
            self.state.update(updates)
            self.version += 1
            await self.publish_state_change(old_state, self.state)
```

## 4. 行为模型（非 Skill 化）

### 4.1 内部行为形式

Room Agent 内部行为**不要求 Skill 形式**，可以是：

| 形式 | 适用场景 | 示例 |
|------|---------|------|
| 状态机 | 模式切换 | idle → sleep 时关闭所有设备 |
| 规则引擎 | 条件触发 | 温度 > 28°C 时打开空调 |
| 硬编码逻辑 | 简单固定逻辑 | 心跳每30秒发送一次 |

**示例**:
```python
# 状态机示例
if mode == "sleep" and occupancy == True:
    curtain.set_state("closed")
    light.set_state("off")
    ac.set_temperature(26)

# 规则引擎示例
rules = [
    Rule(condition="temperature > 28", action="ac.on"),
    Rule(condition="light > 500 and mode == 'meeting'", action="curtain.close")
]
```

### 4.2 行为触发来源

1. **Room State 变化**: 状态驱动行为（如模式切换）
2. **定时器**: 周期性行为（如心跳、状态同步）
3. **外部指令**: 响应上层 Agent 命令

## 5. 对外能力接口（极简）

### 5.1 必选接口

#### 5.1.1 获取房间状态

```python
get_room_state() -> RoomState
```

- 返回当前 Room State 快照
- 只读操作
- 用于 Personal Agent 查询房间状态

#### 5.1.2 设置房间模式

```python
set_room_mode(mode: RoomMode) -> None
```

- `mode` 为有限枚举: `idle | sleep | meeting | custom`
- 具体行为由 Room Agent 内部决定
- 触发内部状态机或规则引擎

**示例**:
```python
# Personal Agent 发送
set_room_mode("sleep")

# Room Agent 内部执行（不暴露给外部）
if mode == "sleep":
    close_curtain()
    turn_off_lights()
    set_ac(26)
```

#### 5.1.3 房间能力声明

```python
get_room_capability() -> Capability
```

- 返回房间可支持的能力集合（**非设备级**）
- 用于 Personal Agent 判断是否适合执行意图

**示例**:
```json
{
  "room_id": "bedroom_01",
  "supported_modes": ["idle", "sleep", "meeting"],
  "device_types": ["light", "curtain", "ac"],
  "environment_sensing": ["temperature", "humidity", "light"],
  "actuation": true
}
```

### 5.2 可选接口

| 接口 | 描述 | 是否暴露 |
|------|------|---------|
| `request_device_action(device, action)` | 直接控制设备 | 部署决定 |
| `request_robot_service(type)` | 请求机器人服务 | 部署决定 |

**原则**: 是否暴露可选接口由部署场景决定，不强制要求。

## 6. Beacon 与发现机制

### 6.1 Beacon 实现架构

**Beacon 功能由外接 ESP32 硬件实现**，配合 **qwen-backend** 服务完成设备发现。

```
┌─────────────┐         ┌─────────────┐         ┌──────────────────┐
│  ESP32      │         │qwen-backend │         │ Personal Agent   │
│  Beacon     │ BLE     │ Beacon API  │◄── HTTP │                  │
└─────────────┘         └──────┬──────┘         └────────┬─────────┘
   BLE 广播                    │                         │
   (beacon_id)          ┌──────┴──────┐                  │
                       │ Room Agent  │                  │
                       │ MQTT Broker │◄─────────────────┘
                       └─────────────┘     MQTT 连接
```

**发现流程**:
1. **ESP32**: 广播 BLE Beacon（仅包含 beacon_id，编码为 UUID/Major/Minor）
2. **Personal Agent**: 扫描 Beacon，提取 beacon_id
3. **Personal Agent**: 调用 `GET /api/beacon/{beacon_id}` 查询详细信息
4. **qwen-backend**: 返回 mqtt_broker、room_id、agent_id 等信息
5. **Personal Agent**: 使用返回的地址连接到 Room Agent 的 MQTT Broker

### 6.2 Beacon 广播内容（最小化）

Beacon **仅广播唯一标识符**，不包含任何房间状态信息。

**iBeacon 格式**:
```json
{
  "uuid": "01234567-89AB-CDEF-0123456789ABCDEF",
  "major": 2,    // 房间类型：2 = Bedroom
  "minor": 0,    // 区域标识符
  "tx_power": -59  // 1米处校准的 RSSI
}
```

**设计原则**:
- ✅ 广播最小化信息（仅 beacon_id）
- ✅ 避免频繁更新 BLE 广播内容
- ✅ 房间状态通过 MQTT 获取
- ❌ 不在 Beacon 中塞入动态状态

### 6.3 qwen-backend Beacon API

**注册 Beacon** (Room Agent 启动时调用):
```http
POST /api/beacon
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

**查询 Beacon** (Personal Agent 调用):
```http
GET /api/beacon/{beacon_id}

Response:
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

### 6.4 Room Agent 配置

**Room Agent 启动时自动注册**:
```yaml
beacon:
  enabled: true
  hardware: "esp32"
  device_id: "esp32_beacon_01"

  # iBeacon 参数
  uuid: "01234567-89AB-CDEF-0123456789ABCDEF"
  major: 2  # Bedroom = 2
  minor: 0
  measured_power: -59

  # qwen-backend 配置
  backend:
    url: "http://192.168.1.50:3000"
    register_on_startup: true
    heartbeat_interval: 60  # 秒
```

### 6.5 ESP32 硬件要求

| 要求 | 规格 | 说明 |
|------|------|------|
| 芯片 | ESP32-C3/ESP32-S3 | 支持 BLE 5.0 |
| BLE | iBeacon 广播 | 仅需广播，无需连接 |
| 功耗 | < 1W | USB 供电或电池 |
| 固件 | 简化固件 | 仅广播，无需 MQTT |

**ESP32 固件职责**:
- ✅ 定时广播 iBeacon 信号
- ✅ 纯硬件实现，无需连接网络
- ❌ 不需要连接 Room Agent
- ❌ 不需要动态更新广播内容

## 7. 协作模型

### 7.1 Personal Agent → Room Agent

Personal Agent 是 Room Agent 的主要消费者与决策主体。

**Personal Agent 通过 Room Agent**:
- 感知当前房间状态（用于意图理解与决策）
- 判断是否适合执行某个用户意图
- 决定是否介入、切换房间或下发指令

**典型交互**:
```
1. Personal Agent → Room Agent: 查询房间状态
2. Personal Agent → Room Agent: 监听房间 Beacon
3. Personal Agent → Room Agent: 请求房间模式变更
4. Room Agent → Personal Agent: 发布状态更新
```

### 7.2 Room Agent → 子 Agent

Room Agent 对下游子 Agent（设备/机器人/传感器）承担执行协调者角色。

**职责**:
- 将来自 Personal Agent 的高层决策转化为具体动作
- 屏蔽子 Agent 的实现细节
- 汇总执行结果并更新 Room State
- 不暴露子 Agent 细节给上层

**示例**:
```python
# 收到上层意图
intent = {"action": "sleep_mode", "room": "bedroom"}

# 转化为具体动作
device_actions = [
    {"device": "curtain", "action": "close"},
    {"device": "light", "action": "off"},
    {"device": "ac", "action": "set", "params": {"temp": 26}}
]

# 执行并更新状态
for action in device_actions:
    result = execute_device_action(action)
    update_room_state(action.device, result)
```

### 7.3 Room Agent ↔ Central Agent

**Room Agent → Central Agent**:
- 上报房间状态摘要（低频）
- 请求冲突仲裁
- 订阅全局策略更新

**Central Agent → Room Agent**:
- 推送全局策略
- 返回仲裁结果
- 广播系统级事件

## 8. 运行与部署

### 8.1 运行平台

| 平台 | 支持状态 | 备注 |
|------|---------|------|
| Jetson Nano/Orin | ✅ 推荐 | ARM64, Ubuntu |
| 树莓派 4/5 | ✅ 支持 | ARM64, Raspberry Pi OS |
| x86 Linux | ✅ 支持 | 任意发行版 |
| 云端 VM | ⚠️ 不推荐 | 延迟问题 |

### 8.2 部署形态

```yaml
部署模式: 常驻进程
启动方式: systemd / supervisor
资源占用:
  CPU: 空闲 < 5%, 负载 < 30%
  内存: < 200MB
  网络: MQTT + mDNS
```

## 9. 非功能性要求

### 9.1 稳定性

| 要求 | 指标 | 保障机制 |
|------|------|---------|
| 子 Agent 掉线 | 不导致 Room Agent 崩溃 | 异常捕获 + 降级 |
| 设备离线 | 标记状态，继续服务 | 状态隔离 |
| 网络中断 | 本地控制继续可用 | 本地状态管理 |

### 9.2 性能

| 指标 | 目标 | 测量方法 |
|------|------|---------|
| 状态查询延迟 | < 100ms | 本地读取 |
| 控制命令响应 | < 500ms | 命令到状态更新 |
| 心跳周期 | 30s | 定时发送 |

## 10. 明确不做的事情（Anti-Spec）

| 功能 | 理由 |
|------|------|
| Skill 市场兼容 | 过度抽象，不实用 |
| 通用设备抽象标准 | 内部实现自由，不需要 |
| Prompt 工程 | 不是 LLM Agent |
| 多用户对话管理 | Personal Agent 的职责 |

## 11. 配置示例

```yaml
agent:
  id: "room-agent-bedroom"
  room_id: "bedroom_01"
  version: "1.0.0"

room_state:
  storage: "memory"  # memory, sqlite, redis
  persist_interval: 60  # seconds

mqtt:
  broker:
    host: "0.0.0.0"
    port: 1883
    ws_port: 9001
    max_connections: 100
  topics:
    base: "room/bedroom_01"

beacon:
  enabled: true
  hardware: "esp32"
  device_id: "esp32_beacon_01"

  # iBeacon 参数（用于 BLE 广播）
  uuid: "01234567-89AB-CDEF-0123456789ABCDEF"
  major: 2  # Bedroom = 2
  minor: 0
  measured_power: -59  # RSSI at 1m

  # qwen-backend 注册配置
  backend:
    url: "http://192.168.1.50:3000"
    register_on_startup: true
    heartbeat_interval: 60  # 秒

modes:
  idle:
    default: true
  sleep:
    triggers:
      - time: "22:00-07:00"
      - manual: true
    actions:
      - curtain: "close"
      - light: "off"
      - ac: {temp: 26, mode: "cool"}
  meeting:
    triggers:
      - manual: true
    actions:
      - light: "on"
      - curtain: "close"
      - noise: "low"

devices:
  - id: "ceiling_light"
    type: "light"
    protocol: "mqtt"
    address: "mqtt://localhost/devices/light"
  - id: "curtain"
    type: "curtain"
    protocol: "http"
    address: "http://192.168.1.201/api"

mdns:
  service_name: "bedroom-room-agent"
  service_type: "_room-agent._tcp.local"
  port: 1883
  txt_records:
    room_id: "bedroom_01"
    mqtt_port: "1883"
    version: "1.0.0"
```

## 12. 与数字人 Agent 的关系

**数字人Agent = Room Agent 的具体实现**

本文档中的 Room Agent 规格适用于数字人 Agent:
- 数字人 Agent 负责管理一个房间（或功能空间）
- 维护该房间的统一状态
- 向 Personal Agent 提供房间级能力
- 接收并执行来自 Personal Agent 的意图

数字人 Agent 可以在本文档基础上扩展：
- 添加数字人特有的交互能力（语音、视觉）
- 添加 AI 对话能力
- 保持 Room State 作为核心抽象

---

**相关文档**:
- [Personal Agent 技术规格](./personal-agent.md)
- [Central Agent 技术规格](./central-agent.md)
- [通信协议](../communication.md)
