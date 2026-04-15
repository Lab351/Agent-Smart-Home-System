# Qwen Backend 设备接入协议

本文档定义 `qwen-backend` 在当前系统中的设备接入标准协议。

协议基线：

- 主协议：`Beacon API + Registry API + A2A SDK`

本文档版本：`v1`

## 1. 协议立场

自 `2026-03-24` 起，仓库当前约定的开发主线是 `A2A-first`。

这意味着：

- `qwen-backend` 负责注册、发现、保活
- Agent 间业务交互优先使用 `a2a-sdk`

尤其需要明确：

- 当前 A2A 路径已经覆盖控制请求和能力发现
- 当前 A2A 路径**尚未**形成标准化的“设备状态持续订阅协议”

## 2. 适用范围

本协议适用于以下组件：

- `esp32-ble-beacon`：提供 `beacon_id`
- `qwen-backend`：提供 Beacon / Agent 注册与发现能力
- `room-agent`：暴露 A2A 服务，执行房间控制逻辑
- `personal-agent` / `react-native-personal-agent`：发现房间、查询 Agent、发起 A2A 调用
- `home-agent`：后续参与全局仲裁或上层协调

## 3. 分层职责

### 3.1 控制面

控制面由 `qwen-backend` 提供，基于 HTTP/JSON：

- Beacon 注册
- Beacon 查询
- Agent 注册
- Agent 发现
- 心跳保活

### 3.2 业务面

业务面由 A2A 提供，基于 `a2a-sdk`：

- `/.well-known/agent-card.json`：能力发现
- `message/send`：发送业务请求
- `tasks/get`：查询任务状态和执行结果

## 4. 核心对象

### 4.1 Beacon 注册对象

用于建立 `beacon_id -> room_id -> agent_id` 的发现链路。

```json
{
  "beacon_id": "esp32-beacon-bedroom-01",
  "room_id": "bedroom",
  "agent_id": "room-agent-bedroom",
  "capabilities": ["device_control", "scene_activation"],
  "devices": [
    {
      "id": "light_1",
      "name": "主灯",
      "type": "light"
    }
  ]
}
```

字段说明：

| 字段 | 必填 | 说明 |
|---|---|---|
| `beacon_id` | 是 | Beacon 唯一标识 |
| `room_id` | 是 | 房间标识 |
| `agent_id` | 是 | 负责该房间的 Room Agent 标识 |
| `capabilities` | 否 | 房间能力摘要 |
| `devices` | 否 | 设备能力摘要 |

### 4.2 Agent 注册对象

用于建立 `agent_id -> AgentCard -> A2A url` 的发现链路。

```json
{
  "id": "room-agent-bedroom",
  "name": "卧室房间代理",
  "description": "管理卧室设备和房间状态",
  "version": "1.0.0",
  "agent_type": "room",
  "capabilities": ["light_control", "climate_control"],
  "skills": [
    {
      "id": "adjust_lighting",
      "name": "调节照明",
      "description": "处理灯光控制请求",
      "tags": ["light_control"]
    }
  ],
  "devices": [
    {
      "id": "light_1",
      "name": "主灯",
      "type": "light",
      "actions": ["turn_on", "turn_off", "set_brightness"],
      "state_attributes": ["power", "brightness"]
    }
  ],
  "communication": {
    "backend": "a2a_sdk"
  },
  "url": "http://192.168.1.20:8001/",
  "metadata": {
    "room_id": "bedroom"
  }
}
```

补充说明：

- `agent_type` 当前取值：`room`、`personal`、`central`
- `url` 是 A2A 服务入口的基础地址
- Agent Card 获取地址为：`<origin>/.well-known/agent-card.json`
- `devices` 描述设备能力，不代表实时状态

### 4.3 A2A 控制请求载荷

当前客户端实际发送的是 A2A JSON-RPC 请求，业务数据放在 `message.parts[].data` 中。

```json
{
  "jsonrpc": "2.0",
  "id": "rpc-123",
  "method": "message/send",
  "params": {
    "message": {
      "kind": "message",
      "messageId": "msg-123",
      "role": "user",
      "parts": [
        {
          "kind": "data",
          "data": {
            "kind": "control_request",
            "roomId": "bedroom",
            "roomAgentId": "room-agent-bedroom",
            "sourceAgent": "personal-agent-user1",
            "targetDevice": "light_1",
            "action": "turn_on",
            "parameters": {
              "brightness": 80
            },
            "requestId": "req-123",
            "timestamp": "2026-03-24T10:00:00Z"
          }
        }
      ]
    }
  }
}
```

## 5. HTTP 控制面协议

### 5.1 Beacon 注册

`POST /api/beacon/register`

用途：

- 首次建立 `beacon_id -> room_id -> agent_id` 映射
- 更新房间到 Agent 的绑定关系

成功响应：

```json
{
  "success": true,
  "data": {
    "beacon_id": "esp32-beacon-bedroom-01",
    "room_id": "bedroom",
    "agent_id": "room-agent-bedroom",
    "registered_at": "2026-03-24T10:00:00.000Z",
    "last_heartbeat": "2026-03-24T10:00:00.000Z"
  }
}
```

规则：

- 同一个 `beacon_id` 重复注册视为覆盖更新
- 注册成功时刷新 `registered_at` 与 `last_heartbeat`

### 5.2 Beacon 查询

`GET /api/beacon/:beacon_id`

用途：

- Personal Agent 根据 Beacon 获取 `room_id` 和 `agent_id`

说明：

- 当前实现中，查询接口会刷新 `last_heartbeat`
- 协议上不建议把查询当作正式心跳方式

### 5.3 房间反查

`GET /api/beacon/room/:room_id`

用途：

- 根据 `room_id` 反查绑定 Beacon 与目标 Agent

### 5.4 Beacon 心跳

`POST /api/beacon/:beacon_id/heartbeat`

用途：

- 刷新 Beacon 映射存活时间

### 5.5 Beacon 注销

`DELETE /api/beacon/:beacon_id`

用途：

- 设备下线
- 设备迁移
- 主动解除房间绑定

### 5.6 Agent 注册

`POST /api/registry/register`

用途：

- 注册 AgentCard
- 注册 A2A 服务入口
- 提供能力发现基础数据

请求头：

```http
Content-Type: application/json
```

请求体：

```json
{
  "id": "room-agent-bedroom",
  "name": "卧室房间代理",
  "description": "管理卧室设备和房间状态",
  "version": "1.0.0",
  "agent_type": "room",
  "capabilities": ["light_control", "climate_control"],
  "skills": [
    {
      "id": "adjust_lighting",
      "name": "调节照明",
      "description": "处理灯光控制请求",
      "tags": ["light_control"]
    }
  ],
  "devices": [
    {
      "id": "light_1",
      "name": "主灯",
      "type": "light",
      "actions": ["turn_on", "turn_off", "set_brightness"],
      "state_attributes": ["power", "brightness"]
    }
  ],
  "communication": {
    "backend": "a2a_sdk",
    "a2a_sdk": {
      "transport": "jsonrpc-http"
    }
  },
  "url": "http://192.168.1.20:8001/",
  "documentation_url": "http://192.168.1.20:8001/.well-known/agent-card.json",
  "authentication": {
    "type": "none"
  },
  "metadata": {
    "room_id": "bedroom"
  }
}
```

字段约束：

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | 是 | Agent 唯一标识 |
| `name` | 是 | Agent 名称 |
| `description` | 是 | Agent 描述 |
| `agent_type` | 是 | `room` / `personal` / `central` |
| `version` | 否 | Agent 版本 |
| `capabilities` | 否 | 能力标签列表 |
| `skills` | 否 | 技能列表 |
| `devices` | 否 | 设备能力摘要 |
| `communication` | 否 | 通信配置，推荐标记为 `a2a_sdk` |
| `url` | 否 | Agent A2A 服务入口 |
| `documentation_url` | 否 | 文档或 Agent Card URL |
| `authentication` | 否 | 认证配置 |
| `metadata` | 否 | 附加元数据，建议带 `room_id` |

成功响应：

```json
{
  "success": true,
  "data": {
    "id": "room-agent-bedroom",
    "name": "卧室房间代理",
    "description": "管理卧室设备和房间状态",
    "version": "1.0.0",
    "agent_type": "room",
    "capabilities": ["light_control", "climate_control"],
    "skills": [
      {
        "id": "adjust_lighting",
        "name": "调节照明",
        "description": "处理灯光控制请求",
        "tags": ["light_control"]
      }
    ],
    "devices": [
      {
        "id": "light_1",
        "name": "主灯",
        "type": "light",
        "actions": ["turn_on", "turn_off", "set_brightness"],
        "state_attributes": ["power", "brightness"]
      }
    ],
    "communication": {
      "backend": "a2a_sdk",
      "a2a_sdk": {
        "transport": "jsonrpc-http"
      }
    },
    "url": "http://192.168.1.20:8001/",
    "documentation_url": "http://192.168.1.20:8001/.well-known/agent-card.json",
    "authentication": {
      "type": "none"
    },
    "metadata": {
      "room_id": "bedroom"
    },
    "registered_at": "2026-03-24T10:00:00.000Z",
    "last_heartbeat": "2026-03-24T10:00:00.000Z"
  }
}
```

失败响应：

- 参数非法时，返回框架校验错误
- 服务异常时，返回 Nest.js 默认错误响应

### 5.7 Agent 发现

`GET /api/registry/discover?agent_id=<id>&agent_type=<type>&capability=<cap>`

支持过滤：

- `agent_id`
- `agent_type`
- `capability`

查询参数：

| 参数 | 必填 | 说明 |
|---|---|---|
| `agent_id` | 否 | 精确匹配 Agent ID |
| `agent_type` | 否 | 枚举值：`room` / `personal` / `central` |
| `capability` | 否 | 按 `capabilities` 或 `skills[].tags` 过滤 |

请求示例 1：按 Agent ID 查询

```http
GET /api/registry/discover?agent_id=room-agent-bedroom
```

请求示例 2：按类型查询

```http
GET /api/registry/discover?agent_type=room
```

请求示例 3：按能力查询

```http
GET /api/registry/discover?capability=light_control
```

成功响应：

```json
{
  "success": true,
  "data": [
    {
      "id": "room-agent-bedroom",
      "name": "卧室房间代理",
      "description": "管理卧室设备和房间状态",
      "version": "1.0.0",
      "agent_type": "room",
      "capabilities": ["light_control", "climate_control"],
      "skills": [
        {
          "id": "adjust_lighting",
          "name": "调节照明",
          "description": "处理灯光控制请求",
          "tags": ["light_control"]
        }
      ],
      "devices": [
        {
          "id": "light_1",
          "name": "主灯",
          "type": "light",
          "actions": ["turn_on", "turn_off", "set_brightness"],
          "state_attributes": ["power", "brightness"]
        }
      ],
      "communication": {
        "backend": "a2a_sdk"
      },
      "url": "http://192.168.1.20:8001/",
      "metadata": {
        "room_id": "bedroom"
      },
      "registered_at": "2026-03-24T10:00:00.000Z",
      "last_heartbeat": "2026-03-24T10:03:00.000Z"
    }
  ]
}
```

空结果响应：

```json
{
  "success": true,
  "data": []
}
```

过滤规则细节：

- `agent_id` 命中时，返回长度为 `0` 或 `1` 的数组
- `agent_type` 为精确匹配
- `capability` 同时匹配：
  - `capabilities[]`
  - `skills[].tags[]`

### 5.7.1 获取单个 Agent 详情

`GET /api/registry/:agent_id`

请求示例：

```http
GET /api/registry/room-agent-bedroom
```

成功响应：

```json
{
  "success": true,
  "data": {
    "id": "room-agent-bedroom",
    "name": "卧室房间代理",
    "description": "管理卧室设备和房间状态",
    "version": "1.0.0",
    "agent_type": "room",
    "capabilities": ["light_control", "climate_control"],
    "url": "http://192.168.1.20:8001/",
    "metadata": {
      "room_id": "bedroom"
    },
    "registered_at": "2026-03-24T10:00:00.000Z",
    "last_heartbeat": "2026-03-24T10:03:00.000Z"
  }
}
```

未找到响应：

```json
{
  "success": false,
  "message": "Agent room-agent-bedroom not found"
}
```

### 5.8 Agent 心跳

`POST /api/registry/:agent_id/heartbeat`

用途：

- 刷新 Agent 在线状态
- 避免注册信息被超时清理

路径参数：

| 参数 | 必填 | 说明 |
|---|---|---|
| `agent_id` | 是 | 目标 Agent ID |

请求头：

```http
Content-Type: application/json
```

请求体：

- 当前实现中，请求体为空

请求示例：

```http
POST /api/registry/room-agent-bedroom/heartbeat
```

成功响应：

```json
{
  "success": true,
  "message": "Heartbeat updated"
}
```

失败响应：

```json
{
  "success": false,
  "message": "Agent not found"
}
```

行为约束：

- 心跳成功时，仅刷新 `last_heartbeat`
- 不修改 `registered_at`
- 不修改 AgentCard 其他业务字段

建议频率：

- `30` 到 `60` 秒一次

### 5.8.1 获取 Agent 列表

`GET /api/registry/list`

成功响应：

```json
{
  "success": true,
  "data": [
    {
      "id": "room-agent-bedroom",
      "agent_type": "room",
      "url": "http://192.168.1.20:8001/",
      "registered_at": "2026-03-24T10:00:00.000Z",
      "last_heartbeat": "2026-03-24T10:03:00.000Z"
    },
    {
      "id": "central-agent-home",
      "agent_type": "central",
      "url": "http://192.168.1.30:8010/",
      "registered_at": "2026-03-24T10:00:00.000Z",
      "last_heartbeat": "2026-03-24T10:02:30.000Z"
    }
  ]
}
```

### 5.9 超时清理

`POST /api/registry/cleanup?timeout=<ms>`

当前默认超时：

- `300000 ms`，即 `5 分钟`

## 6. A2A 业务协议

### 6.1 Agent Card 获取

客户端通过 Agent 基础地址获取：

- `GET /.well-known/agent-card.json`

用途：

- 查询能力
- 查询技能
- 查询设备摘要
- 获取 Agent 基本描述

当前实现中，`personal-agent` 与 `react-native-personal-agent` 都是通过 Agent Card 做能力查询。

### 6.2 发送控制请求

客户端调用：

- `POST <agent_url>`
- JSON-RPC `method = "message/send"`

业务数据放入：

- `params.message.parts[].data`

当前约定的业务类型：

- `kind = "control_request"`

### 6.3 查询任务结果

若 `message/send` 返回任务而非即时结果，则继续调用：

- JSON-RPC `method = "tasks/get"`

用途：

- 查询执行状态
- 查询最终结果
- 处理长任务

### 6.4 当前已标准化的 A2A 能力

当前可以认为已经进入主协议范围的能力只有：

- AgentCard 能力发现
- `message/send` 控制请求
- `tasks/get` 任务轮询

### 6.5 当前未标准化的能力

以下能力目前**不能**写成 A2A 主协议既有标准：

- 设备状态持续订阅
- 房间状态实时广播
- 运行时 push 心跳
- description 的流式推送

原因：

- 当前 A2A transport 的 `subscribeToState()` 尚未实现
- 当前 `room-agent` 的 A2A 服务声明 `streaming = false`
- 当前 `room-agent` 的 A2A 服务声明 `push_notifications = false`

因此，当前协议只能定义：

- 静态能力发现：通过 Agent Card
- 请求结果获取：通过 `message/send` + `tasks/get`

不能定义：

- “客户端持续订阅房间设备状态”的 A2A 标准接口

### 6.6 后续建议

如果后续要把“设备状态监听”正式纳入 A2A 主协议，建议新增一套明确的 A2A 语义。可选方向：

1. 基于 A2A streaming 定义 `state_stream`
2. 基于 A2A task/result 定义 `get_room_state`
3. 由 Room Agent 提供专门的状态查询 HTTP 接口，再由 Agent Card 暴露

## 7. 心跳与在线状态标准

### 7.1 规范性心跳

当前唯一规范性的保活方式是 HTTP 注册心跳：

- `POST /api/beacon/:beacon_id/heartbeat`
- `POST /api/registry/:agent_id/heartbeat`

建议频率：

- 每 `30` 到 `60` 秒一次

### 7.2 A2A 不承担注册保活

A2A 请求成功不等于注册中心保活成功。

即使 Agent 能正常响应：

- 仍然需要独立调用 Registry heartbeat
- 仍然需要独立调用 Beacon heartbeat

## 8. 接入时序

### 8.1 Room Agent 启动

1. Room Agent 启动自身 A2A 服务
2. 调用 `POST /api/beacon/register` 注册空间映射
3. 调用 `POST /api/registry/register` 注册 AgentCard 和 A2A 地址
4. 周期性调用 `POST /api/beacon/:beacon_id/heartbeat`
5. 周期性调用 `POST /api/registry/:agent_id/heartbeat`

### 8.2 Personal Agent 发现与调用

1. 扫描到 `beacon_id`
2. 调用 `GET /api/beacon/:beacon_id`
3. 拿到 `room_id`、`agent_id`
4. 调用 `GET /api/registry/discover?agent_id=<agent_id>`
5. 读取返回的 `url`
6. 获取 `/.well-known/agent-card.json`
7. 调用 `message/send`
8. 必要时轮询 `tasks/get`

### 8.3 当前状态监听约定

当前主协议下，没有标准化的 A2A 状态订阅步骤。

如果产品阶段必须实时看房间状态，应单独补一套新的 A2A/HTTP 状态查询或订阅协议。

## 10. 错误处理约定

`v1` 约定优先兼容当前实现：

- 查询不到对象时，优先返回 HTTP `200` + `success: false`
- 参数错误或服务异常时，返回 Nest.js 默认异常响应

推荐业务错误语义：

| 场景 | 建议 message |
|---|---|
| Beacon 不存在 | `Beacon not found` |
| Agent 不存在 | `Agent not found` |
| 房间未绑定 | `No beacon found for room: <room_id>` |
| 参数不合法 | `Invalid request payload` |

## 11. 命名规范

- `beacon_id`：推荐 `esp32-beacon-<room>-<index>`
- `agent_id`：推荐 `room-agent-<room>`
- `room_id`：推荐小写英文 slug，如 `livingroom`、`bedroom`
- `device.id`：推荐房间内稳定唯一，如 `light_1`、`ac_1`

## 12. 实现来源

本文档依据以下实现整理：

- `qwen-backend/src/beacon/beacon.controller.ts`
- `qwen-backend/src/beacon/beacon.service.ts`
- `qwen-backend/src/beacon/dto/beacon.dto.ts`
- `qwen-backend/src/registry/registry.controller.ts`
- `qwen-backend/src/registry/registry.service.ts`
- `qwen-backend/src/registry/dto/registry.dto.ts`
- `room-agent/app/a2a_server.py`
- `personal-agent/src/services/transports/A2AControlTransport.js`
- `react-native-personal-agent/src/services/transports/a2a-http-control-transport.ts`
## 13. 后续扩展建议

如果后续需要把“状态监听”纳入主协议，建议明确拆成独立能力，而不是混在注册协议里。推荐新增其中一种：

- A2A: `state_stream`
- A2A: `get_room_state`
- HTTP: `GET /api/room-state/:room_id`

这样可以继续保持边界清晰：

- `qwen-backend` 负责注册与发现
- A2A 负责控制与任务语义
- 状态监听作为单独能力明确建模
