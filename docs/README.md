# 智能家居 Agent 系统 - 文档中心

## 文档结构

```
docs/
├── README.md                          # 本文档 - 文档导航索引
├── system-overview.md                 # 系统总览与核心概念
├── agents/                            # Agent 规格说明
│   ├── personal-agent.md              # Personal Agent (随身 Agent)
│   ├── room-agent.md                  # Room Agent (房间 Agent)
│   └── central-agent.md               # Central Agent (中央 Agent)
├── communication.md                   # 通信协议与消息格式
├── deployment.md                      # 部署架构与运维
├── TEST_CASES.md                      # 测试用例
└── specs/                             # PDF 版本的技术规格
    ├── Central Agent 技术规格说明（Spec）.pdf
    ├── Personal Agent 技术规格说明（Spec）.pdf
    └── Room Agent 技术规格说明（Spec）.pdf
```

## 快速导航

### 核心文档
- **[系统总览](./system-overview.md)** - 了解系统整体架构、设计原则和核心概念
- **[通信协议](./communication.md)** - MQTT 主题、消息格式、QoS 策略
- **[测试用例](./TEST_CASES.md)** - 完整的测试场景和验收标准

### Agent 详细规格
- **[Personal Agent](./agents/personal-agent.md)** - 用户意图理解与决策发起
  - 部署：手机、手表等随身设备
  - 核心能力：自然语言理解、近场空间发现、动态绑定

- **[Room Agent](./agents/room-agent.md)** - 房间状态管理与设备控制
  - 部署：Jetson、树莓派等边缘设备
  - 核心能力：房间状态维护、设备抽象、局部决策

- **[Central Agent](./agents/central-agent.md)** - 全局协调与策略管理
  - 部署：NAS、Mini PC、云端（可选）
  - 核心能力：全局状态、策略仲裁、冲突解决

## 系统架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                      智能家居空间                             │
│                                                              │
│   ┌────────────┐      ┌────────────┐      ┌────────────┐   │
│   │  Personal  │      │    Room    │      │   Central  │   │
│   │   Agent    │◄────►│   Agent    │◄────►│   Agent    │   │
│   │  (随身)    │ MQTT │  (房间)    │ MQTT │  (中央)    │   │
│   └────────────┘      └────────────┘      └────────────┘   │
│         ▲                                         ▲         │
│         │ BLE Beacon                              │         │
│         │                                         │         │
│   ┌─────┴─────┐                             ┌────┴─────┐  │
│   │   Space   │                             │ Policy  │  │
│   │  Binding  │                             │ Engine  │  │
│   └───────────┘                             └──────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## 三层架构

### 1. 空间感知层 (Spatial Awareness)
- **技术**: BLE Beacon
- **职责**: Personal Agent 通过扫描 Beacon 确定当前位置
- **特点**: 低功耗、无需配对、基于 RSSI 的距离判断

### 2. 房间管理层 (Room Management)
- **技术**: mDNS + MQTT
- **职责**: Room Agent 管理房间状态、设备控制、局部决策
- **特点**: 房间自治、状态优先、最小接口

### 3. 全局协调层 (Global Coordination)
- **技术**: MQTT (跨房间订阅)
- **职责**: Central Agent 维护全局状态、策略管理、冲突仲裁
- **特点**: 逻辑中心化、软约束、事件驱动

## 核心设计原则

### Personal Agent
- **以人为中心**: 所有行为由用户意图触发
- **低侵入性**: 运行于随身设备，无需固定基础设施
- **隐私优先**: 个人数据本地处理

### Room Agent
- **Room-first**: 以物理空间为中心，而非设备或技能
- **State > Skill**: 维护房间状态，而非提供大量接口
- **最小接口**: 只暴露跨 Agent 协作的必要能力

### Central Agent
- **逻辑中心化，执行去中心化**: 维护全局一致性，但不破坏房间自治
- **软约束优先**: 通过规则引导，而非强制控制
- **默认不介入**: 仅在必要时（冲突、违规）才介入

## 通信协议栈

```
┌─────────────────────────────────────────────────────────┐
│                    Agent 通信层                          │
│  Personal Agent ←── MQTT → Room Agent ←── MQTT → Central│
└─────────────────────────────────────────────────────────┘
                          ▲
┌─────────────────────────────────────────────────────────┐
│                    服务发现层                            │
│           mDNS (Room Agent 广播)                        │
└─────────────────────────────────────────────────────────┘
                          ▲
┌─────────────────────────────────────────────────────────┐
│                    空间绑定层                            │
│          BLE Beacon (空间感知)                          │
└─────────────────────────────────────────────────────────┘
```

## 消息流示例

### 场景 1: 用户控制灯光
```
1. Personal Agent 扫描 Beacon → 确定在"客厅"
2. Personal Agent 通过 mDNS 发现 Room Agent
3. Personal Agent 连接到 Room Agent 的 MQTT Broker
4. 用户说"打开灯"
5. Personal Agent 发布意图到 Room Agent
6. Room Agent 执行设备控制
7. Room Agent 发布状态更新
8. Personal Agent 接收状态并反馈给用户
```

### 场景 2: 睡眠模式冲突仲裁
```
1. Central Agent 广播"sleep_mode"激活
2. 用户夜间说"播放音乐"
3. Personal Agent 发送意图到 Room Agent
4. Room Agent 检测到与 sleep_mode 冲突
5. Room Agent 请求 Central Agent 仲裁
6. Central Agent 返回: partial_accept (降级: 音量 20%)
7. Room Agent 执行降级后的命令
8. Personal Agent 反馈用户: "已为您播放轻柔音乐"
```

## 部署形态

| Agent | 部署位置 | 硬件要求 | 网络要求 |
|-------|---------|---------|---------|
| Personal Agent | 手机、手表 | ARM64/x86 | Wi-Fi + BLE |
| Room Agent | Jetson/树莓派 | ARM64/Linux | 以太网/Wi-Fi |
| Central Agent | NAS/Mini PC/云端 | x86/ARM64 | 以太网 |

## 快速开始

### 开发者
1. 阅读 [system-overview.md](./system-overview.md) 了解整体架构
2. 阅读 [communication.md](./communication.md) 理解消息格式
3. 查看具体 Agent 的规格文档了解实现细节

### 测试人员
1. 直接查看 [TEST_CASES.md](./TEST_CASES.md)
2. 参考测试计划准备测试环境
3. 按优先级执行测试用例

### 运维人员
1. 参考 [deployment.md](./deployment.md) 了解部署架构
2. 查看各 Agent 文档中的"部署"章节
3. 参考非功能性需求了解监控指标

## 版本历史

- **v1.0** (2026-02-17): 初始版本，基于三份 PDF spec 整理

## 相关资源

- **项目仓库**: [agent-home-system](https://github.com/your-org/agent-home-system)
- **Submodules**:
  - [room-agent](../room-agent/) - Room Agent 实现
  - [esp32-ble-beacon](../esp32-ble-beacon/) - BLE Beacon 固件
