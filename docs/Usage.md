# 使用与测试

本文档是仓库当前的开发者使用手册，覆盖环境准备、启动顺序、最小联调与测试入口。主文档按目标架构组织，但命令与配置路径以当前仓库可执行事实为准。

## 1. 环境要求

| 组件 | 要求 |
|---|---|
| Python | `>= 3.12` |
| Node.js | `>= 18` |
| 包管理 | `uv`、`npm` |
| Personal Agent | Quick App/HAP 开发环境 |
| 可选 | Docker、Mosquitto、局域网 BLE 环境 |

## 2. 依赖安装

### Room Agent

```bash
cd room-agent
uv sync
```

### Home Agent

```bash
cd home-agent
uv sync
```

### Qwen Backend

```bash
cd qwen-backend
npm install
cp .env.example .env
```

### Personal Agent

```bash
cd personal-agent
npm install
```

`personal-agent` 需要手动创建运行配置：

```bash
cp src/config/agent.config.example.js src/config/agent.config.js
```

## 3. 配置入口

| 模块 | 主要配置 |
|---|---|
| `room-agent` | `room-agent/config/room_agent.yaml` |
| `home-agent` | `home-agent/config/default_config.yaml` |
| `qwen-backend` | `qwen-backend/.env` |
| `personal-agent` | `personal-agent/src/config/agent.config.js` |

### 当前配置建议

- `qwen-backend` 负责 Beacon API、Registry API 和聊天后端，开发环境建议先启动。
- `personal-agent` 发现 Room Agent 时优先读取 `agentInfo.url`，因此 Registry 注册信息中应包含有效 A2A endpoint。
- 如仍使用兼容路径，需要同时补齐 MQTT 相关字段。

## 4. 推荐启动顺序

### 4.1 启动 Qwen Backend

```bash
cd qwen-backend
npm run start:dev
```

启动后默认可用入口：

- `POST /chat`
- `GET /api/beacon/list`
- `GET /api/registry/list`

### 4.2 启动 Room Agent

```bash
cd room-agent
uv run python app/main.py "打开卧室主灯" --config config/room_agent.yaml
```

该入口当前是最小 CLI 运行方式，便于验证 LangGraph 重构后的主流程。

### 4.3 启动 Home Agent

```bash
cd home-agent
uv run python main.py
```

默认会同时拉起中央协调逻辑和 RAG HTTP API。

### 4.4 启动 Personal Agent

```bash
cd personal-agent
npm run start
```

如果需要构建包：

```bash
npm run build
```

## 5. 模块最小 Smoke Test

### Qwen Backend

```bash
curl http://127.0.0.1:3000/api/registry/list
curl http://127.0.0.1:3000/api/beacon/list
```

### Room Agent

```bash
cd room-agent
uv run pytest
```

### Home Agent

当前仓库包含 `home-agent/tests/`，但 `home-agent/pyproject.toml` 未显式声明 `pytest` 依赖。若需执行该目录测试，请先在本地测试环境补齐 `pytest` 后运行：

```bash
python -m pytest home-agent/tests
```

### Shared / 根测试工程

```bash
uv run --project tests pytest -q tests/test_a2a_models.py tests/test_home_scenarios.py
```

### Personal Agent transport 单测

```bash
node --experimental-default-type=module --test \
  tests/node/test_personal_agent_control_service.mjs \
  tests/node/test_personal_agent_a2a_transport.mjs
```

## 6. A2A Mock Server 与 Transport Smoke

### 启动 mock A2A server

```bash
python3 tests/demo/mock_a2a_server.py --host 127.0.0.1 --port 4040
```

### 检查 AgentCard

```bash
curl http://127.0.0.1:4040/.well-known/agent-card.json
```

### 发送一次控制请求

```bash
curl -X POST http://127.0.0.1:4040/a2a/jsonrpc \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": "req-1",
    "method": "message/send",
    "params": {
      "message": {
        "kind": "message",
        "messageId": "msg-1",
        "role": "user",
        "parts": [
          {
            "kind": "data",
            "data": {
              "kind": "control_request",
              "roomId": "bedroom",
              "roomAgentId": "room-agent-bedroom",
              "sourceAgent": "watch-user1",
              "targetDevice": "light",
              "action": "turn_on",
              "parameters": {
                "brightness": 80
              },
              "requestId": "req-1",
              "timestamp": "2026-03-18T10:00:00Z"
            }
          }
        ]
      }
    }
  }'
```

## 7. 常见调试入口

| 场景 | 入口 |
|---|---|
| Beacon / Agent 发现异常 | `qwen-backend` 的 `/api/beacon/*`、`/api/registry/*` |
| Personal Agent 控制链路 | `personal-agent/src/services/ControlService.js`、`transports/*` |
| Room Agent 图执行异常 | `room-agent/app/main.py` 与 `room-agent/tests/graph/*` |
| A2A mock 协议验证 | `tests/demo/mock_a2a_server.py` |
| Personal Agent transport 回归 | `tests/node/*.mjs` |

### 当前实现注记

- `VoiceControl` 已接入 `A2AControlTransport`。
- 首页和房间绑定页仍保留 MQTT 兼容逻辑。
- 因此联调时应优先验证 `VoiceControl -> Room Agent` 这条 A2A 主链路。
