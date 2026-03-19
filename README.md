# Agent Home System

智能家居多 Agent 协作系统。目标架构以 `BLE Beacon + Beacon/Registry API + A2A` 为主线，包含 Personal Agent、Room Agent、Central Agent、后端发现服务与共享协议层。

## 文档入口

- [Transport](./docs/Transport.md)
- [Architect](./docs/Architect.md)
- [Usage](./docs/Usage.md)
- [Glossary](./docs/Glossary.md)

## 主要模块

- `personal-agent/`：Personal Agent，负责用户意图、个人上下文、空间绑定与控制请求发起。
- `room-agent/`：Room Agent，负责房间级决策、设备控制和房间状态。
- `home-agent/`：Central Agent，负责全局策略、仲裁和中央协调。
- `qwen-backend/`：Beacon API、Registry API 与聊天后端。
- `shared/`：共享模型、协议与运行时抽象。
- `esp32-ble-beacon/`：Beacon 固件。

## 快速开始

完整启动、配置和测试说明见 [Usage](./docs/Usage.md)。

常用入口：

```bash
# room-agent
cd room-agent
uv sync
uv run python app/main.py "打开卧室主灯" --config config/room_agent.yaml

# home-agent
cd home-agent
uv sync
uv run python main.py

# qwen-backend
cd qwen-backend
npm install
npm run start:dev

# personal-agent
cd personal-agent
npm install
npm run start
```
