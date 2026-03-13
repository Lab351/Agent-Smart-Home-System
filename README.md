# Agent Home System - 智能家居多 Agent 协作系统

一个基于空间感知的分布式智能家居多 Agent 协作系统，通过 BLE Beacon、qwen-backend Beacon Registry API 和 MQTT 实现自适应的空间绑定和设备控制。

## 系统概述

### 核心特性

- **空间感知**: 基于 BLE Beacon 的自动房间识别
- **去中心化**: 每个房间独立运行，Central Agent 仅在必要时协调
- **多用户支持**: 原生支持家庭多用户并发使用
- **离线可用**: Room Agent 在断网时仍可本地控制
- **隐私优先**: 个人数据优先本地处理

### 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                       智能家居空间                              │
│                                                                   │
│  ┌──────────┐      ┌──────────┐      ┌──────────┐            │
│  │ Personal │◄────►│   Room   │◄────►│  Central  │            │
│  │  Agent   │ MQTT │  Agent   │ MQTT │  Agent   │            │
│  │ (随身)   │      │ (房间)   │      │  (中央)  │            │
│  └────┬─────┘      └────┬─────┘      └──────────┘            │
│       │                 │                                       │
│       │ BLE Beacon     │ MQTT Broker                          │
│       │                 │ (Local)                              │
│       ▼                 ▼                                       │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │           三层协议栈                                     │  │
│  │  BLE Beacon ──► Beacon Registry API ──► MQTT Communication  │  │
│  └─────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Agent 介绍

### Personal Agent (随身 Agent)
- **部署**: 手机、手表等随身设备
- **职责**:
  - 用户意图理解（语音/文本）
  - 个人上下文维护
  - 近场空间发现（BLE Beacon 扫描）
  - 动态绑定 Room Agent
- **仓库**: [home-agent/](home-agent/) (复用中央 Agent 仓库)
- **规格**: [docs/agents/personal-agent.md](docs/agents/personal-agent.md)

### Room Agent (房间 Agent)
- **部署**: Jetson、树莓派等边缘设备
- **职责**:
  - 房间状态管理（统一 Room State）
  - 设备抽象与控制
  - MQTT Broker 管理（房间级）
  - Beacon Registry 注册/心跳维护
  - 局部决策执行
- **仓库**: [room-agent/](room-agent/)
- **规格**: [docs/agents/room-agent.md](docs/agents/room-agent.md)

### Central Agent (中央 Agent)
- **部署**: NAS、Mini PC、云端（可选）
- **职责**:
  - 全局状态管理（家庭模式、用户状态）
  - 策略与规则管理（睡眠模式、离家模式等）
  - 冲突仲裁（多用户冲突、策略违规）
  - 系统事件广播
- **仓库**: [home-agent/](home-agent/)
- **规格**: [docs/agents/central-agent.md](docs/agents/central-agent.md)

## 快速开始

### 环境要求

- Python 3.12+
- MQTT Broker (如 Mosquitto)
- 局域网环境

### 克隆仓库

```bash
git clone --recursive https://gitproxy.mcurobot.com/kungraduate/agent-home-system.git
cd agent-home-system
```

### 初始化 Submodules

如果克隆时忘记使用 `--recursive`：

```bash
git submodule update --init --recursive
```

### 安装依赖

#### Room Agent
```bash
cd room-agent
uv sync
```

#### Home Agent (Central Agent)
```bash
cd home-agent
uv sync
```

### 配置

#### Room Agent
编辑 `room-agent/config/config.yaml`：
```yaml
agent:
  room_id: "livingroom"

mqtt:
  broker:
    host: "0.0.0.0"
    port: 1883

beacon:
  uuid: "01234567-89AB-CDEF-0123456789ABCDEF"
  major: 1  # 客厅 = 1
```

#### Home Agent (Central Agent)
编辑 `home-agent/config/default_config.yaml`：
```yaml
agent:
  home_id: "home-001"

mqtt:
  brokers:
    - room_id: "livingroom"
      host: "192.168.1.100"
      port: 1883
```

### 运行

#### 启动 Room Agent
```bash
cd room-agent
uv run python main.py
```

#### 启动 Central Agent
```bash
cd home-agent
uv run python main.py
```

## 项目结构

```
agent-home-system/
├── shared/                    # 共享库
│   ├── models/               # MQTT 消息模型
│   └── mqtt/                 # MQTT 客户端管理器
├── home-agent/               # Central Agent (submodule)
│   ├── core/central_agent/
│   │   ├── state_manager.py
│   │   ├── policy_engine.py
│   │   ├── arbitrator.py
│   │   └── central_agent.py
│   ├── config/
│   └── main.py
├── room-agent/               # Room Agent (submodule)
│   ├── core/room_agent/
│   ├── config/
│   └── main.py
├── esp32-ble-beacon/         # BLE Beacon 固件 (submodule)
├── docs/                     # 文档中心
│   ├── README.md             # 文档导航
│   ├── system-overview.md    # 系统总览
│   ├── agents/              # Agent 规格说明
│   ├── communication.md      # 通信协议
│   └── TEST_CASES.md         # 测试用例
└── README.md                 # 本文件
```

## 通信协议

### MQTT Topics

```
room/{room_id}/
├── agent/{agent_id}/
│   ├── control/          # 控制命令
│   ├── state/            # 状态更新
│   ├── describe/         # 能力查询
│   ├── description/      # 能力响应
│   └── heartbeat/        # 心跳
└── system/
    ├── discovery/
    └── error/

home/
├── state/                # 全局状态
├── policy/               # 策略更新
├── arbitration/          # 冲突仲裁
├── events/               # 系统事件
└── heartbeat/            # Central Agent 心跳
```

### QoS 策略

| Topic 类型 | QoS | 说明 |
|-----------|-----|------|
| control | 1 | 命令不能丢失 |
| state | 0 | 最新状态足够 |
| heartbeat | 0 | 周期性更新 |
| home/state | 0 | 全局状态 |
| home/policy | 1 | 策略更新 |
| home/arbitration | 1 | 仲裁决定 |

详见：[docs/communication.md](docs/communication.md)

## 开发

### 测试

```bash
# Room Agent 测试
cd room-agent
uv run pytest

# 查看测试用例
cat docs/TEST_CASES.md
```

### 代码规范

```bash
# 格式化代码
uv run black .

# 代码检查
uv run ruff check .
```

## 测试环境

### 硬件
- Jetson Orin (ARM64) x3 - Room Agent
- ESP32 x3 - BLE Beacon (客厅、卧室、书房)
- 智能设备：灯光、窗帘、空调等

### 网络
- 局域网: 192.168.1.x
- MQTT Broker: 本地或远程

## 文档

完整文档请查看 [docs/](docs/) 目录：

- **[系统总览](docs/system-overview.md)** - 架构设计、核心概念
- **[Personal Agent 规格](docs/agents/personal-agent.md)** - 随身 Agent 详细设计
- **[Room Agent 规格](docs/agents/room-agent.md)** - 房间 Agent 详细设计
- **[Central Agent 规格](docs/agents/central-agent.md)** - 中央 Agent 详细设计
- **[通信协议](docs/communication.md)** - MQTT、BLE、Beacon Registry API 规范
- **[测试用例](docs/TEST_CASES.md)** - 完整测试场景

## 技术栈

- **语言**: Python 3.12
- **通信**: MQTT (paho-mqtt), Beacon Registry API (qwen-backend)
- **空间感知**: BLE Beacon (bluepy)
- **数据验证**: Pydantic
- **异步**: asyncio
- **包管理**: uv

## 与传统智能家居对比

| 特性 | 传统系统 | 本系统 |
|------|---------|--------|
| 控制中心 | 单一中控 | 三层 Agent 协作 |
| 空间感知 | 手动房间选择 | BLE Beacon 自动识别 |
| 离线能力 | 云依赖 | Room Agent 本地自治 |
| 多用户 | 单用户设计 | 原生多用户支持 |
| 扩展性 | 中心化瓶颈 | 去中心化，易扩展 |

## 部署拓扑

```
┌───────────────────────────────────────────────────────┐
│                      家庭网络                        │
│                                                       │
│  ┌──────────────┐                                   │
│  │ NAS/Mini PC  │                                   │
│  │ Central Agent│◄──────┐                          │
│  │ MQTT Broker  │       │                          │
│  └──────┬───────┘       │                          │
│         │                │                          │
│  ┌──────┴───────┐   ┌────┴─────┐   ┌──────────┐  │
│  │ Jetson x3    │   │ ESP32 x3 │   │ 智能设备  │  │
│  │ Room Agent   │   │ Beacon   │   │ 灯光/窗帘 │  │
│  └──────────────┘   └──────────┘   └──────────┘  │
└───────────────────────────────────────────────────────┘
```

## 路线图

- [x] **Phase 1**: 基础自动化
  - [x] BLE Beacon 空间绑定
  - [x] MQTT 通信框架
  - [x] 基础设备控制

- [ ] **Phase 2**: 多房间协作
  - [ ] Central Agent 完整实现
  - [ ] 全局模式管理
  - [ ] 多用户冲突仲裁

- [ ] **Phase 3**: AI 增强
  - [ ] LLM 意图理解
  - [ ] 上下文感知决策
  - [ ] 个性化学习

## 贡献

欢迎提交 Issue 和 Pull Request！

## 许可证

待定

## 联系方式

- 项目仓库: https://gitproxy.mcurobot.com/kungraduate/agent-home-system

---

**相关链接**:
- [Room Agent 仓库](https://gitproxy.mcurobot.com/kungraduate/room-agent.git)
- [Home Agent 仓库](https://gitproxy.mcurobot.com/kungraduate/home-agent.git)
- [ESP32 Beacon 仓库](https://gitproxy.mcurobot.com/kungraduate/esp32-ble-beacon.git)
