# 通信协议

本文档描述当前智能家居多 Agent 系统的通信主线。当前主推荐方案是 `A2A SDK`。`MQTT` 仍保留为兼容字段和后续适配方向，但不再作为当前协议规范主体展开。

## 1. 通信总览

当前通信链路由四个环节组成：

```text
Beacon -> Beacon API -> Registry / AgentCard -> A2A SDK
```

### 最小流程

1. Personal Agent 扫描到 `beacon_id`，确认当前房间。
2. Personal Agent 调用 Beacon API，获得 `room_id` 与 `agent_id`。
3. Personal Agent 调用 Registry API，获得目标 Agent 的注册信息和 `AgentCard`。
4. Personal Agent 根据 `AgentCard.communication` 和 `AgentCard.url` 建立 A2A SDK 通信。
5. 后续控制、状态同步、能力描述、仲裁都通过 A2A 语义消息完成。

### 当前约束

- Beacon 只负责“空间绑定”，不承载动态状态。
- Registry 只负责“Agent 发现与注册信息查询”，不负责业务决策。
- A2A SDK 负责“Agent 间任务与消息交换”。
- `AgentCard.communication.backend` 允许 `mqtt | a2a_sdk`，但当前文档主推荐 `a2a_sdk`。
- 现有 Beacon DTO 仍包含 `mqtt_broker` 字段，这是兼容历史实现的返回信息，不作为当前主协议核心。

## 2. 发现协议

### Beacon API

Beacon API 负责把空间信号转换成可查询的房间上下文。

| 接口 | 作用 |
|---|---|
| `POST /api/beacon/register` | Room Agent 启动时注册 Beacon 与房间映射 |
| `GET /api/beacon/:beacon_id` | Personal Agent 根据 Beacon 查询房间与 Agent 标识 |
| `POST /api/beacon/:beacon_id/heartbeat` | 更新 Beacon 在线状态 |

### Registry API

Registry API 负责注册 AgentCard 并支持按条件发现 Agent。

| 接口 | 作用 |
|---|---|
| `POST /api/registry/register` | 注册 AgentCard |
| `GET /api/registry/discover` | 按 `agent_id`、`agent_type`、`capability` 发现 Agent |
| `POST /api/registry/:agent_id/heartbeat` | 更新 Agent 心跳 |

### 推荐发现顺序

1. `GET /api/beacon/:beacon_id`
2. 从返回值中读取 `agent_id`、`room_id`
3. `GET /api/registry/discover?agent_id=<room-agent-id>`
4. 从注册结果中读取 `AgentCard`、`communication`、`url`
5. 按 `communication.backend=a2a_sdk` 建立通信

## 3. Agent 描述

`AgentCard` 是当前系统中唯一有效的 Agent 描述对象。它既用于注册发现，也用于能力声明。

### 关键字段

| 字段 | 含义 |
|---|---|
| `id` | Agent 唯一标识 |
| `name` | Agent 名称 |
| `description` | Agent 描述 |
| `version` | Agent 版本 |
| `agent_type` | `room`、`personal`、`central` |
| `capabilities` | 跨 Agent 可见的能力集合 |
| `skills` | A2A 语义层的技能或能力说明 |
| `devices` | 设备能力摘要 |
| `communication` | 通信配置，含 `backend` 与后端配置 |
| `url` | A2A SDK 服务入口 |
| `authentication` | 认证信息 |
| `metadata` | 补充信息，如 `room_id`、位置、标签 |

### 通信配置

`CommunicationConfig.backend` 当前允许：

- `a2a_sdk`: 当前推荐主线
- `mqtt`: 兼容或后续适配

### 最小示例

```json
{
  "id": "room-agent-bedroom-01",
  "name": "卧室房间代理",
  "agent_type": "room",
  "capabilities": ["light_control", "climate_control"],
  "communication": {
    "backend": "a2a_sdk",
    "a2a_sdk": {
      "server_port": 8001
    }
  },
  "url": "http://192.168.1.100:8001",
  "metadata": {
    "room_id": "bedroom_01"
  }
}
```

## 4. 消息语义

### 基础类型

#### `A2AMessage`

所有 A2A 消息共享以下公共字段：

| 字段 | 含义 |
|---|---|
| `message_id` | 消息唯一标识 |
| `timestamp` | ISO 8601 时间戳 |
| `correlation_id` | 请求与响应关联标识，可选 |

#### `A2ATask`

`A2ATask` 是 Agent 协作的基本单元，用于表示一个持续中的任务。

| 字段 | 含义 |
|---|---|
| `id` | 任务 ID |
| `status` | `pending`、`running`、`completed`、`failed`、`canceled` |
| `message` | 关联消息 |
| `result` | 任务结果 |
| `error` | 错误信息 |
| `created_at` | 创建时间 |
| `updated_at` | 更新时间 |

### 主要消息类型

| 消息 | 发送方 | 作用 | 关键字段 |
|---|---|---|---|
| `ControlMessage` | Personal / Room | 发起控制动作 | `source_agent`、`target_device`、`action`、`parameters`、`task` |
| `StateMessage` | Room | 发布房间内设备状态变化 | `agent_id`、`devices[]`、`agent_status` |
| `DescriptionMessage` | 任意 Agent | 返回 Agent 描述 | `agent_id`、`agent_card` |
| `HeartbeatMessage` | 任意 Agent | 保持在线状态 | `agent_id`、`status`、`uptime_seconds`、`metrics` |
| `GlobalStateMessage` | Central | 发布全局状态 | `home_mode`、`active_users`、`risk_level`、`temporal_context` |
| `ArbitrationRequestMessage` | Room / Personal | 请求仲裁 | `requesting_agent`、`conflicting_agents`、`conflict_type`、`intent`、`context` |
| `ArbitrationResponseMessage` | Central | 返回仲裁结论 | `request_id`、`decision`、`reason`、`suggestion`、`modified_action` |

### 语义约束

- `ControlMessage` 表达“想做什么”，不表达底层传输细节。
- `StateMessage` 只发布状态结果，不替代 `Room State` 的所有内部字段。
- `DescriptionMessage` 以 `AgentCard` 为主体，不再单独维护另一套协议级能力模型。
- `GlobalStateMessage` 只描述全局抽象状态，不直接下发设备命令。
- `ArbitrationResponseMessage` 返回决策结果，由 Room Agent 负责真正执行。

## 5. 典型时序

### 房间绑定

1. Personal Agent 扫描到 Beacon。
2. 调用 `GET /api/beacon/:beacon_id`，得到 `room_id` 和 `agent_id`。
3. 调用 `GET /api/registry/discover?agent_id=...`，得到目标 AgentCard。
4. 根据 `AgentCard.url` 或 `communication.a2a_sdk` 建立 A2A 会话。

### 控制执行

1. Personal Agent 生成结构化用户意图。
2. Personal Agent 向 Room Agent 发送 `ControlMessage`。
3. Room Agent 执行本地规则和设备控制。
4. Room Agent 更新 `Room State`。
5. Room Agent 向 Personal Agent 返回 `StateMessage` 或任务结果。

### 冲突仲裁

1. Room Agent 发现请求与全局模式或多用户意图冲突。
2. Room Agent 向 Central Agent 发送 `ArbitrationRequestMessage`。
3. Central Agent 返回 `ArbitrationResponseMessage`。
4. Room Agent 按决策执行，并对外发布最新状态。

## 6. 当前有效定义

以下代码对象和接口是当前文档对应的真实定义来源：

- `shared/models/agent_card.py`
- `shared/models/a2a_messages.py`
- `qwen-backend/src/registry/dto/registry.dto.ts`
- `qwen-backend/src/registry/registry.controller.ts`
- `qwen-backend/src/beacon/dto/beacon.dto.ts`
- `qwen-backend/src/beacon/beacon.controller.ts`
