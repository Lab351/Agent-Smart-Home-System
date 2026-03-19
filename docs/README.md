# 智能家居 Agent 系统文档

根目录 `docs/` 是当前唯一规范入口。主文档分为传输协议、系统架构、使用手册三部分。

## 核心文档

- [Transport](./Transport.md)：Agent 间通信协议、发现链路、AgentCard、A2A 消息语义、时序图
- [Architect](./Architect.md)：系统架构、模块边界、状态权威、职责分工
- [Usage](./Usage.md)：启动方式、配置入口、测试与最小联调
- [Glossary](./Glossary.md)：统一术语说明

## 模块专属文档

- [personal-agent/docs/ASR_INTEGRATION.md](../personal-agent/docs/ASR_INTEGRATION.md)
- [personal-agent/docs/ASR_QUICKSTART.md](../personal-agent/docs/ASR_QUICKSTART.md)
- [personal-agent/docs/ASR_SUMMARY.md](../personal-agent/docs/ASR_SUMMARY.md)
- [personal-agent/docs/A2A_CLIENT_DEMO.md](../personal-agent/docs/A2A_CLIENT_DEMO.md)
- [room-agent/docs/LANGGRAPH_REBUILD_MIGRATION_PLAN.md](../room-agent/docs/LANGGRAPH_REBUILD_MIGRATION_PLAN.md)
- [room-agent/docs/ESP32_BEACON_BINDING.md](../room-agent/docs/ESP32_BEACON_BINDING.md)

## 文档约束

- 目标架构以 `BLE Beacon + Beacon/Registry API + A2A` 为主线。
- MQTT 兼容路径可在实现中存在，但不作为规范主叙事。
- 架构、协议、使用说明不再分散到多套重复目录中维护。
