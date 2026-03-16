# Personal Agent (随身 Agent) - 快应用版

基于快应用框架实现的智能家居随身智能体，运行于智能手表等可穿戴设备。

## 📋 项目概述

Personal Agent (PA) 是代表用户个体的智能体，作为智能家居系统的"用户意图与偏好的唯一权威源"。

### 相关文档

1. 快应用使用 websocket：https://doc.quickapp.cn/tutorial/features/using-websocket.html?h=websocket
2. 快应用使用 BLE：https://doc.quickapp.cn/tutorial/features/using-bluetooth.html

### 核心功能

- ✅ **用户意图理解** - 自然语言/语音/手势输入的解析
- ✅ **语音识别（ASR）** - 集成阿里云语音识别，自动转换语音为文本
- ✅ **个人上下文维护** - 用户状态、偏好、历史
- ✅ **近场空间发现** - 通过 BLE Beacon 确定当前位置
- ✅ **动态绑定** - 自动连接到所在房间的 Room Agent
- ✅ **决策发起** - 向 Room/Central Agent 发送意图请求
- ✅ **用户偏好管理** - 智能提取和保存用户习惯

### 设计目标

| 目标 | 描述 | 优先级 |
|------|------|--------|
| 以人为中心 | 所有行为由用户意图触发 | P0 |
| 低侵入性 | 运行于手表等随身设备 | P0 |
| 空间无关性 | 不绑定固定房间或设备 | P0 |
| 实时感知 | 支持近场空间动态发现 | P0 |
| 隐私优先 | 个人数据优先本地处理 | P1 |

---

## 📁 项目结构

```
watch-agent/
├── sign/                      # rpk 包签名模块
│   ├── certificate.pem        # 证书文件
│   └── private.pem            # 私钥文件
└── src/
    ├── assets/                # 公用资源
    │   ├── images/           # 图片资源
    │   ├── styles/           # 样式资源 (less/css/sass)
    │   ├── js/               # 公共 JavaScript 代码
    │   └── iconfont/         # 图标字体
    ├── helper/                # 自定义工具类
    │   ├── ajax.js           # fetch API 封装
    │   └── utils/            # 工具类方法
    ├── pages/                 # 页面级代码
    │   ├── Index/            # 首页 - 房间状态与快捷操作
    │   ├── VoiceControl/     # 语音控制页面
    │   ├── RoomBinding/      # 房间绑定状态
    │   └── Settings/         # 设置页面
    ├── components/            # 快应用组件
    │   ├── BeaconScanner/    # BLE Beacon 扫描组件
    │   ├── IntentParser/     # 意图解析组件
    │   ├── MqttClient/       # MQTT 客户端组件
    │   └── RoomCard/         # 房间状态卡片组件
    ├── services/              # 业务服务层
    │   ├── BeaconService/    # Beacon 扫描服务
    │   ├── IntentService/    # 意图理解服务
    │   ├── MqttService/      # MQTT 通信服务
    │   └── ContextService/   # 个人上下文管理
    ├── models/                # 数据模型
    │   ├── Intent.js         # 意图模型
    │   ├── RoomBinding.js    # 房间绑定模型
    │   └── UserContext.js    # 用户上下文模型
    ├── app.ux                 # 应用入口
    ├── manifest.json          # 快应用配置文件
    └── config/
        ├── beacon.config.js   # Beacon 配置
        ├── mqtt.config.js     # MQTT 配置
        └── agent.config.js    # Agent 配置
└── package.json              # 项目依赖配置
```

---

## 🔧 核心模块

### 1. BeaconScanner - BLE Beacon 扫描器

**功能**: 扫描并识别房间 Beacon，确定用户当前位置

**配置参数** (`config/beacon.config.js`):
```javascript
export default {
  beacon: {
    uuid: "01234567-89AB-CDEF-0123456789ABCDEF",
    rssi_threshold: -70,     // dBm - 信号强度阈值
    hysteresis: 5,           // dB - 滞后阈值，防止抖动
    scan_interval: 1,        // 秒 - 扫描间隔
    scan_window: 100,        // 毫秒 - 扫描窗口
  },
  room_mapping: {
    1: "livingroom",   // 客厅
    2: "bedroom",      // 卧室
    3: "study",        // 书房
  }
}
```

**空间亲和度计算**:
```javascript
function calculateProximityScore(beacons) {
  /**
   * 输入: 检测到的 Beacon 列表 (含 RSSI)
   * 输出: 各房间分数 (0-1)
   *
   * 算法:
   * 1. 按 RSSI 阈值过滤
   * 2. 应用用户偏好加权 (如夜间偏好卧室)
   * 3. 应用时间滞后 (防止快速切换)
   */
  const scores = {};
  for (const beacon of beacons) {
    if (beacon.rssi > RSSI_THRESHOLD) {
      const room = ROOM_MAP[beacon.major];
      const baseScore = normalizeRssi(beacon.rssi);
      const score = applyHysteresis(room, baseScore);
      scores[room] = score;
    }
  }
  return scores;
}
```

### 2. IntentParser - 意图解析器

**功能**: 理解用户自然语言输入，解析为结构化意图

**支持意图类型**:
| 类型 | 示例输入 | 结构化输出 |
|------|---------|-----------|
| 设备控制 | "打开客厅的灯" | `{action: "light_on", device: "ceiling_light", room: "livingroom"}` |
| 环境调节 | "有点热" | `{action: "adjust_climate", parameter: "temperature", target: "lower"}` |
| 场景激活 | "我要休息了" | `{action: "set_mode", mode: "sleep", confidence: 0.92}` |
| 信息查询 | "现在室温多少" | `{action: "query", target: "temperature"}` |

**模糊意图建模**:
```javascript
// 示例1: "有点吵"
{
  intent: "reduce_noise",
  constraints: { noise: "low" }
}

// 示例2: "我要休息一下"
{
  intent: "rest",
  mode: "sleep",
  constraints: {
    light: "off",
    noise: "minimum",
    temperature: "comfortable"
  }
}
```

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

### 3. MqttService - MQTT 通信服务

**功能**: 与 Room/Central Agent 通信

**订阅主题**:
```
room/{room_id}/agent/{room_agent_id}/state       # 房间状态
room/{room_id}/agent/{room_agent_id}/description # 能力描述
home/state                                        # 全局状态
home/policy                                       # 策略更新
home/arbitration/response/{request_id}            # 仲裁响应
```

**发布主题**:
```
room/{room_id}/agent/{room_agent_id}/control      # 控制请求
room/{room_id}/agent/{room_agent_id}/describe     # 能力查询
home/arbitration                                  # 仲裁请求
```

**消息格式** (控制请求):
```json
{
  "message_id": "uuid-v4",
  "timestamp": "2024-01-15T22:30:00Z",
  "source_agent": "personal-agent-user1",
  "target_device": "ceiling_light",
  "action": "turn_on",
  "parameters": {
    "brightness": 80
  }
}
```

### 4. ContextService - 个人上下文管理

**上下文维度**:

| 维度 | 示例 | 用途 |
|------|------|------|
| 身份信息 | user_id: "user1", role: "admin" | 权限控制 |
| 状态信息 | fatigue: "high", activity: "meeting" | 意图理解 |
| 偏好信息 | light: "warm", temp: 24°C | 个性化 |
| 时间上下文 | workday/weekend, day/night | 行为预测 |
| 历史摘要 | last_action: "sleep_mode" | 连贯性 |

**存储策略**:
- 本地优先存储 (使用快应用 `@storage.cache`)
- 可选同步到 Central Agent (需用户授权)
- 敏感数据加密存储

---

## 🔄 状态机

```
┌──────────┐
│  INIT    │ 初始化
└────┬─────┘
     │
     ▼
┌──────────┐
│ SCANNING │ 扫描 Beacon
└────┬─────┘
     │ 发现 Beacon
     ▼
┌──────────┐
│ BINDING  │ mDNS 发现 Room Agent
└────┬─────┘
     │ 连接成功
     ▼
┌──────────┐
│ BOUND    │ 已绑定房间
└────┬─────┘
     │ 收到用户输入
     ▼
┌──────────┐
│ PARSING  │ 解析意图
└────┬─────┘
     │
     ▼
┌──────────┐
│SENDING   │ 发送请求到 Room/Central Agent
└────┬─────┘
     │
     ▼
┌──────────┐
│ WAITING  │ 等待响应
└────┬─────┘
     │
     ├─► Success → 通知用户
     ├─► Failure → 显示错误
     └─► Arbitration → 等待仲裁结果
```

---

## 🎨 主要页面

### 1. Index - 首页

**功能**: 显示当前绑定的房间状态、快捷操作

**UI 元素**:
- 当前房间卡片 (房间名、绑定状态、连接状态)
- 常用设备快捷开关
- 快捷场景按钮
- 语音控制入口

### 2. VoiceControl - 语音控制

**功能**: 语音输入与意图解析

**交互流程**:
1. 点击麦克风按钮
2. 语音输入 (或文本输入)
3. 意图解析
4. 显示解析结果
5. 发送请求
6. 显示执行结果

### 3. RoomBinding - 房间绑定

**功能**: 显示 Beacon 扫描结果、房间绑定状态

**UI 元素**:
- 当前绑定房间
- 可检测到的房间列表 (含信号强度)
- 绑定置信度
- 手动切换房间选项

### 4. Settings - 设置

**功能**: 用户偏好配置

**配置项**:
- Beacon 扫描参数
- MQTT 服务器地址
- 用户偏好 (默认房间模式、首选设备)
- 隐私设置 (数据同步、本地处理)

---

## 🚀 快速开始

### 环境准备

1. **安装快应用开发工具**
   - 下载: https://www.quickapp.cn/docCenter/IDEPublicity
   - 支持扫码调试 / USB 调试 / 模拟器预览

2. **安装依赖**
   ```bash
   yarn install
   ```

### 开发调试

| 命令 | 描述 |
|------|------|
| `yarn start` | 开启服务和监听 |
| `yarn server` | 开启服务 |
| `yarn watch` | 开启监听 |
| `yarn build` | 编译打包，生成 rpk 包 |
| `yarn release` | 生成签名后的 rpk 包 |

### 配置修改

1. **Beacon 配置** (`src/config/beacon.config.js`)
   ```javascript
   export default {
     beacon: {
       uuid: "YOUR_BEACON_UUID",
       rssi_threshold: -70,
       hysteresis: 5,
       scan_interval: 1,
     }
   }
   ```

2. **MQTT 配置** (`src/config/mqtt.config.js`)
   ```javascript
   export default {
     mqtt: {
       host: "YOUR_MQTT_BROKER_HOST",
       port: 1883,
       qos: 1,
       keep_alive: 60,
     }
   }
   ```

3. **Agent 配置** (`src/config/agent.config.js`)
   ```javascript
   export default {
     agent: {
       id: "personal-agent-user1",
       user_id: "user1",
       version: "1.0.0",
     }
   }
   ```

---

## 📡 通信协议

### 向 Room Agent 发送控制请求

```javascript
// Topic: room/{room_id}/agent/{agent_id}/control
const controlMessage = {
  message_id: generateUUID(),
  timestamp: new Date().toISOString(),
  source_agent: this.config.agent.id,
  target_device: "ceiling_light",
  action: "turn_on",
  parameters: {
    brightness: 80
  }
};
```

### 请求仲裁

```javascript
// Topic: home/arbitration
const arbitrationRequest = {
  message_id: generateUUID(),
  timestamp: new Date().toISOString(),
  requesting_agent: this.config.agent.id,
  conflicting_agents: ["personal-agent-user2"],
  conflict_type: "multi_user_intent",
  intent: {
    action: "light_on",
    parameters: { brightness: 100 }
  },
  context: {
    room_id: "livingroom"
  }
};
```

### 接收状态更新

```javascript
// 订阅: room/{room_id}/agent/{agent_id}/state
// 处理房间状态变化
onStateUpdate((state) => {
  this.updateRoomState(state);
});
```

---

## ⚡ 性能优化

### 实时性目标

| 操作 | 目标延迟 | 测量方法 |
|------|---------|---------|
| 意图解析 | < 200ms | 输入到输出 JSON |
| 空间绑定更新 | < 1s | Beacon 变化到绑定切换 |
| 反馈显示 | < 500ms | 收到状态到用户通知 |

### 能耗目标

| 场景 | 功耗目标 | 优化策略 |
|------|---------|---------|
| 前台运行 | < 5% CPU/小时 | 按需扫描 |
| 后台运行 | < 2% CPU/小时 | 降低扫描频率 |
| BLE 扫描 | 可配置 | 动态调整间隔 |

---

## 🔒 隐私与安全

- ✅ **本地意图解析** - 优先使用本地 NLP 模型
- ✅ **端到端加密** - 支持 MQTT TLS
- ✅ **数据共享控制** - 用户可授权粒度 (无/摘要/完整)
- ✅ **敏感数据加密** - 本地存储使用加密

---

## 🧪 测试场景

### 场景1: 自动房间绑定

1. 用户从客厅走到卧室
2. Beacon 信号变化检测
3. 自动重新绑定到卧室 Room Agent
4. UI 更新显示当前房间

### 场景2: 语音控制

1. 用户点击语音控制
2. 说出 "打开客厅的灯"
3. 意图解析成功
4. 发送控制请求到 Room Agent
5. 显示执行结果

### 场景3: 冲突仲裁

1. 用户 A 和用户 B 同时控制同一设备
2. 检测到冲突
3. 发送仲裁请求到 Central Agent
4. 接收仲裁结果
5. 显示降级执行通知

---

## 一些坑点

- 快应用是混合框架，不是基于 webview，不能直接上 mqtt.js，需要自己搓一个 mqtt over websocket

## 📚 相关文档

- [Personal Agent 技术规格](../../docs/agents/personal-agent.md)
- [Room Agent 技术规格](../../docs/agents/room-agent.md)
- [Central Agent 技术规格](../../docs/agents/central-agent.md)
- [通信协议](../../docs/communication.md)

---

## 📝 开发规范

### 代码风格

- 使用 Prettier 格式化: `yarn prettier`
- 实时格式化: `yarn prettier-watch`

### 新增页面

```bash
yarn gen YourPageName
```

### Git 提交规范

```
feat: 新功能
fix: 修复 bug
docs: 文档更新
style: 代码格式调整
refactor: 重构
test: 测试相关
chore: 构建/工具链相关
```

---

**技术栈**: 快应用框架 + JavaScript + MQTT + BLE Beacon

**开发平台**: Android Watch / HarmonyOS Watch

**仓库地址**: https://gitproxy.mcurobot.com/kungraduate/agent-home-system
