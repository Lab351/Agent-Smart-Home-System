# LangGraph 重建迁移计划（阿里云优先）

## 参考信息

主分支 `feature-room-agent`. 新建分支 `alexlin/refactor-langgraph` 进行迁移开发。

开始工作之前移除所有内容（除了本文档） ，然后按照以下计划逐步重建。

保持 commit 窄小，每个 commit 对应一个小功能点（例如：单个节点、工具封装、配置项、测试用例等），并在 commit message 里注明对应的迁移阶段和功能点。

## 0. 参考老代码“重建而非平移”的最佳实践（建议先读）
1. 先建新内核，再做能力回填，不在旧架构上硬改。
2. 用“垂直切片”迁移（一个完整工作流一次迁一条），避免一次性大爆炸。
3. 先定义状态模型与节点契约，再写节点代码，避免流程越迁越乱。
4. 副作用能力（MCP 调用、设备控制、A2A 下发）统一做成工具节点，图里只做编排。
5. 先把可观测性和错误语义定好（trace/run_id/error code），再接业务。
6. 所有外部协议（A2A、MCP、工具 schema）先写契约测试再迁移实现。
7. 配置分层一次收敛：`env > yaml > default`，并明确阿里云优先、OpenAI 兼容兜底。
8. 旧代码仅作为“业务规则参考”，**不要复制旧的任务引擎和循环模型。**

---

## 1. 目标与边界

### 1.1 目标
- 从干净 workspace 启动，建立 LangGraph 核心与统一入口。
- 使用 LangGraph 替代旧的任务队列/调度/执行器编排。
- 保留业务能力（MCP、设备控制、房间业务）并封装为工具节点。
- 通信入口切换到 A2A SDK（移除旧 HTTP task API）。
- 模型供应商优先级：阿里云原生集成 > OpenAI 兼容端口。

### 1.2 非目标
- 语音相关能力（唤醒、TTS 输出）不在本 repo 承载。
- 不保留旧 `TaskQueue/TaskScheduler/UnifiedTaskLoop` 作为长期方案。

---

## 2. 目标架构（重建后）

### 2.1 分层
- `runtime/`：入口与运行时（A2A 入口、配置加载、graph invoke/stream）。
- `graph/`：LangGraph 状态定义、节点、条件路由、子图。
- `tools/`：业务工具封装（MCP、设备发现/控制、后端注册等）。
- `integrations/`：模型与外部系统适配（阿里云、OpenAI 兼容、MCP client、A2A SDK）。
- `domain/`：业务模型与规则（room/device/capability）。

### 2.2 核心关系
- “智能体”不再是自带任务引擎对象，而是 `Graph Runtime + Tools` 的组合。
- “任务”不再是自定义队列对象，而是 LangGraph run/thread 的状态流转。
- 业务流程通过节点/子图表达，状态统一在 `GraphState`。

---

## 3. 提议目录骨架（新 workspace）

```text
room-agent/
  app/
    main.py                      # 统一入口（A2A + Graph）
  graph/
    state.py                     # GraphState 定义
    builder.py                   # 主图构建
    nodes/
      classify_intent.py
      simple_chat.py
      task_router.py
      mcp_call.py
      device_control.py
      finalize.py
    subgraphs/
      mcp_workflow.py
  tools/
    mcp_tools.py                 # MCP 封装（读/写工具）
    device_tools.py              # 设备发现/控制工具
  integrations/
    llm_provider.py              # 阿里云优先 + OAI兼容兜底
    mcp_client.py                # stock MCP client 包装
    a2a_gateway.py               # A2A SDK 适配
  domain/
    models.py
    rules.py
  config/
    settings.py
    room_agent.yaml
  tests/
    contract/
    graph/
    integration/
```

---

## 4. 供应商策略（阿里云优先）

### 4.1 LLM Provider 策略
1. 第一优先：阿里云原生 LangChain 集成（若能力覆盖满足）。
2. 第二优先：OpenAI 兼容模式接入 DashScope 兼容端点（现有代码已验证路径）。
3. 在 `integrations/llm_provider.py` 里做单一工厂，统一返回可调用接口，业务层不感知供应商。

### 4.2 配置建议
- 必填：`DASHSCOPE_API_KEY` / `DASHSCOPE_INTL_API_KEY`（按所选 SDK）。
- 兜底：`OPENAI_BASE_URL` + `OPENAI_API_KEY`（指向兼容端点）。
- 增加 `LLM_PROVIDER=aliyun_native|openai_compatible`。

---

## 5. 分阶段迁移计划（供下一个 session 执行）

## Phase 0：初始化（1 个 session）
目标：建可运行的空壳 Graph 系统。

工作项：
1. 新建 workspace 或新分支下新目录骨架。
2. 引入依赖：LangGraph、LangChain、A2A SDK、MCP Python SDK。
3. 建立 `GraphState`（至少包含：`request_id/session_id/input/intent/task/result/error/trace`）。
4. 建立最小主图：`classify_intent -> simple_chat/finalize`。
5. 接入统一入口 `app/main.py`（可先本地 CLI/A2A stub）。

验收：
- 能执行一次最小图并输出结构化结果。
- 有基本日志与 run_id。

## Phase 1：意图分类与流程路由迁移（1-2 个 session）
目标：替换旧 `ConversationExecutor + TaskDispatcher` 的分类分流能力。

工作项：
1. 迁移 `intent` prompt 逻辑（旧 `config.build_analyze_prompt`）到节点。
2. 定义路由分支：
   - `simple_chat`
   - `task_request/mcp`
   - `task_request/device`
3. 统一错误输出结构（可重试/不可重试）。
4. 增加节点级单测与路由测试。

验收：
- 给定输入能稳定路由到正确分支。
- 输出字段兼容后续节点消费。

## Phase 2：MCP 工作流迁移（2-3 个 session）
目标：替换旧 `McpExecutor` 的核心流程（计划、路由、调用、校验、收敛）。

工作项：
1. 用 `subgraphs/mcp_workflow.py` 实现：
   - `plan(optional) -> choose_tool -> call_tool -> verify -> next/revise -> finalize`
2. `integrations/mcp_client.py` 用 stock MCP client 封装：
   - `initialize/list_tools/call_tool/send_ping`
3. 保留连接治理外壳：
   - 状态、失败计数、重连 backoff、超时熔断（不要直接裸用 SDK）。
4. 将工具结果标准化（统一 `success/result/error/raw`）。

验收：
- 可完成至少 1 个多步 MCP 任务。
- 连接异常时能自动降级或失败退出，不挂死图。

## Phase 3：设备发现与控制工具化（1-2 个 session）
目标：将 room 业务能力转为 LangGraph 生态可调用工具。

工作项：
1. 迁移旧 `DeviceRegistry/DeviceController` 规则，封装为工具：
   - `list_devices`
   - `get_device_state`
   - `control_device`
2. 定义标准工具 schema（含幂等与副作用说明）。
3. 把原 `room_id/beacon/device capability` 约束移入 `domain/rules.py`。

验收：
- 图可基于设备工具完成一次端到端控制任务。
- 工具参数校验清晰，错误可定位。

## Phase 4：A2A 入口替换与协议收敛（1-2 个 session）
目标：移除旧 HTTP 任务端点，统一由 A2A 触发图运行。

工作项：
1. 实现 `integrations/a2a_gateway.py`（入站消息 -> graph invoke）。
2. 建立协议适配层（兼容旧字段到新 state）。
3. 输出回执与状态事件（开始/中间/完成/失败）。

验收：
- A2A 入站消息可触发完整图流程并返回结果。
- 不再依赖旧 `CommunicationServer` HTTP task API。

## Phase 5：收尾与下线旧模块（1 个 session）
目标：清理旧引擎，保留必要业务代码和兼容层。

工作项：
1. 下线旧任务模块：`core/task/*`, `core/server/task_dispatcher.py` 等（按实际依赖逐步删）。
2. 更新 README 与运维文档。
3. 补齐回归测试清单（图流程 + A2A + MCP + device）。

验收：
- 新入口稳定运行。
- 旧调度链路不再被引用。

---

## 6. 旧模块到新模块映射（迁移指引）

| 旧模块 | 新去向 |
|---|---|
| `core/task/*` | `graph/builder.py + graph/nodes/* + subgraphs/*` |
| `core/task/executors/conversation.py` | `nodes/classify_intent.py + nodes/task_router.py` |
| `core/task/executors/mcp.py` | `subgraphs/mcp_workflow.py + tools/mcp_tools.py` |
| `core/mcp_control/*` | `integrations/mcp_client.py + tools/mcp_tools.py`（保留必要管理能力） |
| `core/server/communication_server.py` | `integrations/a2a_gateway.py` |
| `core/room_agent/devices/*` | `tools/device_tools.py + domain/rules.py` |
| `core/client/openai_client.py` | `integrations/llm_provider.py` |
| `core/action/speak_action.py` | 移出本仓库（语音模块） |

---

## 7. 风险与对策
1. MCP 稳定性风险：先做连接治理 wrapper，再逐步增加并发。
2. 供应商切换风险：Provider 工厂抽象 + 双栈集成测试（阿里云原生/兼容端点）。
3. 业务规则丢失风险：先迁移 `domain/rules` 与契约测试，再迁流程代码。
4. 可观测性不足：强制每个节点打 `run_id/node/error/latency`。

---

## 8. 下一会话直接开工清单（Top 10）
1. 建立新目录骨架和依赖。
2. 写 `config/settings.py`（配置分层 + provider 选择）。
3. 写 `integrations/llm_provider.py`（阿里云优先，兼容兜底）。
4. 写 `graph/state.py`。
5. 写 `graph/nodes/classify_intent.py`。
6. 写 `graph/nodes/finalize.py`。
7. 写 `graph/builder.py`（最小可跑图）。
8. 写 `app/main.py`（CLI 或 A2A stub 入口）。
9. 写 3 个最小测试（intent/route/finalize）。
10. 跑通一次端到端最小流程并记录示例输入输出。

