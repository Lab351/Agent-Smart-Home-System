# 智能家居 Agent 系统文档

本文档集当前以 `BLE Beacon + Beacon/Registry API + AgentCard + A2A SDK` 为主线，描述智能家居多 Agent 系统的核心设计。

## 核心文档

- [系统总览](./system-overview.md): 架构分层、角色职责、状态维护、能力边界、协作关系
- [通信协议](./communication.md): 发现流程、AgentCard、A2A 消息语义、典型时序

## 当前文档约束

- 当前规范以 `A2A SDK` 作为 Agent 间通信主线。
- `MQTT` 兼容层暂缓实现，不作为当前协议规范主体。
- `BLE Beacon` 继续负责空间感知。
- `Beacon API` 与 `Registry API` 继续负责空间发现和 Agent 发现。

## 辅助资料

以下文件仍保留，但不再作为当前架构与协议的规范来源：

- `docs/TEST_CASES.md`
- `docs/STAGE_1_5_COMPLETED.md`
- `docs/HomeSystemAgent.md`
- `docs/agents/*.md`
