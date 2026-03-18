# 系统总览

本文档描述当前智能家居多 Agent 系统的核心架构、实现功能、状态维护方式和能力边界。当前主线通信方案为 `A2A SDK`，不再以 MQTT topic 或 broker 设计作为系统主叙事。

## 1. 三层架构

```text
BLE Beacon
  -> 提供房间级空间感知

Beacon / Registry API
  -> 提供房间发现、Agent 发现、AgentCard 查询

A2A SDK
  -> 承载 Agent 间任务、控制、状态、描述、仲裁消息
```

### 分层职责

| 层 | 组件 | 作用 |
|---|---|---|
| 空间感知层 | BLE Beacon | 让 Personal Agent 判断当前所在房间 |
| 发现层 | `/api/beacon/*`、`/api/registry/*` | 把房间标识解析为可访问的 Agent 信息 |
| 通信层 | A2A SDK | 在 Agent 之间传递任务和语义化消息 |

## 2. Agent 角色与状态权威

| Agent | 角色职责 | 状态权威 | 主要实现功能 | 明确不负责 |
|---|---|---|---|---|
| Personal Agent | 代表用户发起意图，完成空间绑定 | 用户意图、个人上下文 | 意图理解、偏好维护、Beacon 扫描、动态绑定、向上游发起请求 | 不直接控制设备，不维护房间状态，不维护全局策略 |
| Room Agent | 代表房间执行局部自治 | `Room State` | 聚合房间设备与传感器状态、执行房间规则、返回房间能力、执行设备控制 | 不理解用户自然语言，不做跨用户仲裁，不维护全局状态 |
| Central Agent | 代表全局规则和一致性 | `Global State`、策略、仲裁结果 | 家庭模式管理、风险状态维护、策略下发、冲突仲裁 | 不直接控制设备，不替代 Room Agent 的本地决策 |

### 状态维护原则

- Personal Agent 是“用户意图与个人上下文”的唯一权威源。
- Room Agent 是“房间状态”的唯一权威源。
- Central Agent 是“全局状态、全局策略、仲裁决策”的唯一权威源。
- 设备执行结果必须先回收敛到 Room Agent，再由 Room Agent 对外发布状态。

## 3. 实现功能

### Personal Agent

- 扫描 Beacon 并确定当前房间。
- 基于房间信息查找对应 Room Agent。
- 保存用户偏好、当前活动、上下文摘要。
- 把自然语言或快捷操作转换为结构化意图。
- 向 Room Agent 或 Central Agent 发起 A2A 请求。

### Room Agent

- 维护统一的 `Room State`，对设备状态、环境状态和房间模式做统一收敛。
- 暴露房间能力摘要，而不是直接暴露大量设备细节为系统主接口。
- 接收来自 Personal Agent 的控制意图并执行本地决策。
- 在本地规则无法闭环时，把冲突或违规请求上报 Central Agent。

### Central Agent

- 维护家庭级模式、活跃用户集合、风险等级、时间上下文。
- 管理全局策略，例如睡眠模式、离家模式、安全模式。
- 对跨用户、跨规则的冲突做仲裁。
- 把“当前全局状态是什么”广播给其他 Agent，而不直接给设备下命令。

## 4. 能力边界

### 对外边界

- Personal Agent 对外提供“用户意图入口”和“个人上下文补充”，不提供设备执行能力。
- Room Agent 对外提供“房间状态”和“房间能力”，不把内部设备编排逻辑暴露为跨 Agent 契约。
- Central Agent 对外提供“全局状态、策略、仲裁结果”，不直接替房间执行动作。

### 决策边界

- 单房间、单用户、无策略冲突的请求由 Room Agent 直接闭环。
- 涉及全局模式、风险状态或多用户冲突的请求由 Central Agent 参与仲裁。
- Personal Agent 负责表达“用户想做什么”，Room Agent 和 Central Agent 负责决定“系统如何执行”。

## 5. 交互关系

### 正常控制流

1. Personal Agent 扫描 Beacon，得到当前房间。
2. Personal Agent 通过发现层获取 Room Agent 的标识与通信入口。
3. Personal Agent 向 Room Agent 发送控制请求。
4. Room Agent 执行本地控制并更新 `Room State`。
5. Room Agent 将结果和最新状态回传给 Personal Agent。

### 仲裁控制流

1. Personal Agent 发送控制请求到 Room Agent。
2. Room Agent 判断请求与全局模式或其他用户意图冲突。
3. Room Agent 向 Central Agent 发起仲裁请求。
4. Central Agent 返回 `accept`、`reject`、`partial_accept` 或 `defer`。
5. Room Agent 按仲裁结果执行，并发布房间状态变化。

## 6. 当前规范入口

- 架构、职责、状态、边界以本页为准。
- 通信协议、发现流程、消息语义以 [communication.md](./communication.md) 为准。
- 历史性的 Agent 独立规格页已降级为索引页，不再重复定义完整规范。
