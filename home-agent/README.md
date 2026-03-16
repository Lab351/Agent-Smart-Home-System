# Home Agent - Central Agent with Home Assistant MCP

智能家居系统的中央协调智能体，通过 MCP（Model Context Protocol）连接到 Home Assistant。

## 🎯 核心功能

- ✅ **全局状态管理** - 家庭模式、用户状态、风险等级
- ✅ **策略规则管理** - 睡眠模式、离家模式、儿童保护
- ✅ **冲突仲裁** - 多用户冲突、策略违规仲裁
- ✅ **Home Assistant 集成** - 通过 MCP 读取状态和调用服务
- ✅ **系统事件广播** - 模式切换、安全事件

## 🏗️ 架构

```
┌─────────────────────────────────────────────────────────┐
│              Home Assistant (MCP Server)             │
│                                                         │
│  实体:                                                 │
│  - sensor.temperature_*                                    │
│  - light.*                                                │
│  - switch.*                                               │
│                                                         │
│  服务:                                                 │
│  - light.turn_on/off                                     │
│  - script.good_night                                      │
└────────────────────┬────────────────────────────────────┘
                     │
                     │ MCP (WebSocket + SSE)
                     │
┌────────────────────▼────────────────────────────────────┐
│            Central Agent (home-agent)                  │
│                                                         │
│  核心组件:                                             │
│  - HomeAssistantMCPClient (MCP 客户端）              │
│  - StateManager (全局状态管理）                         │
│  - PolicyEngine (策略引擎）                              │
│  - Arbitrator (冲突仲裁器）                              │
└────────────────────┬────────────────────────────────────┘
                     │
                     │ MQTT
                     │
┌────────────────────▼────────────────────────────────────┐
│           Room Agents (多个房间）                          │
│  - room-agent-livingroom                                 │
│  - room-agent-bedroom                                    │
│  - room-agent-study                                      │
└─────────────────────────────────────────────────────────┘
```

## 🚀 快速开始

### 1. 安装依赖

```bash
cd home-agent
pip install -r requirements.txt

# 或使用 uv
uv sync
```

### 2. 配置 Home Assistant MCP

#### 2.1 安装 Home Assistant MCP Server

```bash
# 在 Home Assistant 环境中安装
pip install mcp[cli]
```

#### 2.2 配置 MCP Server

Home Assistant MCP Server 配置示例：

```yaml
# configuration.yaml
mcp:
  servers:
    home_assistant:
      url: "ws://localhost:3000/sse"
      api_key: "YOUR_LONG_LIVED_ACCESS_TOKEN"
```

#### 2.3 生成 Long-Lived Access Token

1. 打开 Home Assistant
2. 点击左下角用户头像
3. 滚动到底部，点击 "Create Token"
4. 命名为 "Central Agent"
5. 复制生成的 token

### 3. 配置 Central Agent

复制配置模板：

```bash
cp config/home-assistant.example.yaml config/home-assistant.yaml
```

编辑 `config/home-assistant.yaml`：

```yaml
mcp:
  server_url: "ws://localhost:3000/sse"
  api_key: "YOUR_LONG_LIVED_ACCESS_TOKEN"

  entities:
    - sensor.temperature_livingroom
    - light.livingroom_ceiling
    - light.bedroom_ceiling

  services:
    - light.turn_on
    - light.turn_off

agent:
  agent_id: "central-agent-1"
  home_id: "home-001"

mqtt:
  brokers:
    - room_id: "livingroom"
      host: "192.168.1.100"
      port: 1883
```

### 4. 启动 Central Agent

```bash
python main.py
```

## 📡 Home Assistant 集成

### 读取状态

```python
# 获取单个实体状态
state = await agent.get_home_assistant_state("light.livingroom")
print(f"Light state: {state.state}")  # on/off

# 获取所有状态
all_states = await agent.home_assistant_client.get_all_states()
```

### 调用服务

```python
from core.home_assistant_mcp import ServiceCall

# 打开灯光
service = ServiceCall(
    domain="light",
    service="turn_on",
    service_data={
        "entity_id": "light.livingroom_ceiling",
        "brightness": 255
    }
)
await agent.call_home_assistant_service(service)
```

### 监听状态变化

```python
# 在 _on_home_assistant_state_changed 中处理
async def _on_home_assistant_state_changed(self, state):
    print(f"Entity {state.entity_id} changed to {state.state}")

    # 示例：检测到人不在家
    if "presence" in state.entity_id and state.state == "not_home":
        await self.set_home_mode("away", "home_assistant_presence")
```

## 🧪 测试

### 1. 测试 Home Assistant 连接

```bash
# 测试 Home Assistant MCP 连接
python tests/test_home_assistant_mcp.py
```

### 2. 测试策略引擎

```bash
# 测试策略规则
python tests/test_policy_engine.py
```

### 3. 测试仲裁器

```bash
# 测试冲突仲裁
python tests/test_arbitrator.py
```

## 📁 项目结构

```
home-agent/
├── core/
│   ├── central_agent/
│   │   ├── central_agent.py       # Central Agent 主类
│   │   ├── state_manager.py       # 全局状态管理
│   │   ├── policy_engine.py       # 策略引擎
│   │   └── arbitrator.py         # 冲突仲裁
│   └── home_assistant_mcp/
│       ├── __init__.py
│       └── home_assistant_client.py  # MCP 客户端
├── shared/
│   ├── models/
│   │   └── mqtt_messages.py      # MQTT 消息模型
│   └── mqtt/
│       └── client_manager.py      # MQTT 客户端管理器
├── config/
│   ├── default_config.yaml         # 默认配置
│   └── home-assistant.example.yaml # Home Assistant 配置示例
├── tests/
│   ├── test_central_agent.py
│   ├── test_home_assistant_mcp.py
│   └── test_arbitrator.py
├── main.py                        # 程序入口
├── requirements.txt               # 依赖列表
├── pyproject.toml                 # 项目配置
└── README.md                      # 本文件
```

## 🔧 配置说明

### MCP 配置

| 参数 | 说明 | 必填 |
|------|------|------|
| `server_url` | MCP Server URL | 是 |
| `api_key` | Home Assistant API Token | 是 |
| `entities` | 监听的实体列表 | 否 |
| `services` | 可调用的服务列表 | 否 |

### 策略配置

| 策略 | 说明 | 示例规则 |
|------|------|---------|
| `sleep_mode` | 睡眠模式 | light_max=low, noise_max=minimum |
| `away_mode` | 离家模式 | all_devices=off, security=armed |
| `child_protection` | 儿童保护 | content_filter=enabled, volume_max=50 |

### 用户配置

| 角色 | 优先级 | 说明 |
|------|--------|------|
| `admin` | 100 | 管理员，最高权限 |
| `adult` | 80 | 成人用户 |
| `child` | 50 | 儿童用户，受限权限 |

## 🔌 MQTT Topics

| Topic | 方向 | 说明 |
|-------|------|------|
| `home/state` | 发布 | 全局状态 |
| `home/policy` | 发布 | 策略更新 |
| `home/arbitration` | 订阅 | 仲裁请求 |
| `home/arbitration/response/{request_id}` | 发布 | 仲裁响应 |
| `home/events` | 发布 | 系统事件 |
| `room/+/agent/+/heartbeat` | 订阅 | Room Agent 心跳 |
| `room/+/agent/+/state` | 订阅 | Room Agent 状态 |

## 📊 运行时状态

启动后会显示：

```
============================================================
Central Agent - 智能家居中央协调智能体
============================================================
[CentralAgent] Initialized (id=central-agent-1, home=home-001)
[CentralAgent] Home Assistant MCP client initialized
[CentralAgent] Starting Central Agent...
[CentralAgent] Connecting to ws://localhost:3000/sse...
[CentralAgent] Home Assistant MCP connected
[CentralAgent] Connecting to MQTT broker...
[CentralAgent] Connected to MQTT broker
[CentralAgent] Central Agent started

[Main] Central Agent is running. Press Ctrl+C to stop.
[Main] Active features:
  - Global state management
  - Policy engine
  - Conflict arbitration
  - Home Assistant integration
  - System event broadcasting
```

## 🐛 故障排查

### Home Assistant 连接失败

1. 检查 MCP Server 是否启动
2. 检查 API Key 是否正确
3. 检查网络连接

### MQTT 连接失败

1. 检查 Broker 是否运行
2. 检查端口是否正确
3. 检查防火墙设置

### 状态不同步

1. 检查实体列表配置
2. 检查 Home Assistant 日志
3. 重启 Central Agent

## 📚 相关文档

- [Personal Agent 规格](../docs/agents/personal-agent.md)
- [Room Agent 规格](../docs/agents/room-agent.md)
- [Central Agent 规格](../docs/agents/central-agent.md)
- [通信协议](../docs/communication.md)
- [测试用例](../docs/TEST_CASES.md)

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

待定

---

**相关仓库**:
- Personal Agent: https://gitproxy.mcurobot.com/kungraduate/watch-agent.git
- Room Agent: https://gitproxy.mcurobot.com/kungraduate/room-agent.git
- qwen-backend: https://gitproxy.mcurobot.com/kungraduate/qwen-backend.git
