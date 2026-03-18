# Room Agent LangGraph Graph 规划

本文档用于固化 Room Agent 下一版 LangGraph 工作流设计。该规划不参考现有实现，作为后续重构和重写的独立基线。

## 1. 目标

本图的目标是把 Room Agent 的 LLM 工作流拆成明确的、可替换的节点，并满足以下要求：

- 低成本模型承担轻决策任务。
- 强模型只承担正规 tool call 计划生成。
- 确定性执行与生成式推理解耦。
- 人审能力通过独立节点预留，不提前耦合进别的节点。
- State 结构化，并为后续扩展预留空间。
- 后续接入本地推理模型时，不需要重做主流程拆分。

## 2. Graph 总览

当前确认的主流程如下：

```text
START
  -> intent_recognition
    -> if need_tool_call = false: direct_response
    -> if need_tool_call = true: tool_selection
         -> tool_call_planning
         -> human_review (当前先占位 / 默认跳过)
         -> execute
         -> END

direct_response
  -> END
```

未来如业务需要，可以在 `execute` 之后增加 `response_render` 节点，用于把执行结果转成面向用户的自然语言回复。

## 3. 路由原则

当前只保留一个显式路由决策点：

- `intent_recognition` 之后，根据 `need_tool_call` 做条件边跳转。

设计约束如下：

- 不在节点内部做特殊跳转逻辑。
- 优先使用 LangGraph 的条件边能力表达分支。
- 后续如果新增节点，应尽量保持路由显式、集中、可追踪。

## 4. State 设计

### 4.1 核心字段

初版共享状态最少包含以下字段：

- `user_input`
- `intent`
- `need_tool_call`
- `candidate_tools`
- `selected_tools`
- `plan`
- `human_review`
- `execution_args`
- `execution_result`
- `error`

### 4.2 扩展预留

为后续编码预留扩展空间，初版同时建议预留以下字段：

- `metadata`
- `artifacts`
- `status`

建议含义如下：

- `metadata`: 追踪信息、时间戳、置信度、来源等附加信息。
- `artifacts`: 中间产物，例如工具原始输出、结构化解析结果、模型草稿。
- `status`: 当前流程状态，避免后续只靠多个布尔值拼状态。

### 4.3 结构化约束

State 采用结构化定义，不使用松散字典作为长期方案。

建议后续实现时：

- 用 `TypedDict` 或等价结构定义 graph state。
- 对关键嵌套字段单独建类型，例如 `IntentResult`、`ToolSelectionResult`、`ExecutionPlan`、`ExecutionError`。
- 即使初版字段少，也保持可演进的 schema 边界。

## 5. 节点职责

### 5.1 `intent_recognition`

职责：

- 只做意图识别和是否需要工具调用的判断。

输入：

- `user_input`

输出：

- `intent`
- `need_tool_call`
- 可选写入 `metadata.intent_confidence`

明确不做：

- 不生成 `candidate_tools`
- 不生成 `selected_tools`
- 不生成 `plan`
- 不生成工具参数

设计原因：

- 该节点刻意保持轻量，方便后续接入本地小模型。
- 只承担低成本分类任务，保持节点职责单一。

### 5.2 `direct_response`

职责：

- 在不需要工具调用时，由低成本模型直接给出回复结果。

输入：

- `user_input`
- `intent`

输出：

- 当前字段方案待 A2A spec 最终确认

当前约束：

- 该节点由低成本模型承载，不走强模型。
- 该节点不负责生成 tool call。

未决项：

- 该节点的输出是写入专用字段，还是复用统一结果字段，等待 A2A 返回内容要求确认后再定。

### 5.3 `tool_selection`

职责：

- 在确认需要工具调用后，只负责选择可用工具。

输入：

- `user_input`
- `intent`
- `need_tool_call`

输出：

- `candidate_tools`
- `selected_tools`

明确不做：

- 不组装参数
- 不生成最终执行计划
- 不生成最终回复

设计原因：

- 刻意把“选什么工具”和“怎么调用工具”拆开，方便替换为本地推理模型实现。

### 5.4 `tool_call_planning`

职责：

- 基于选中的工具生成正规 tool call 执行计划。

输入：

- `user_input`
- `intent`
- `selected_tools`

输出：

- `plan`
- `execution_args`

明确不做：

- 不直接执行工具
- 不承担普通直接回复

设计原因：

- 该节点是高能力推理节点，只负责把选择过的工具转成规范化可执行计划。

### 5.5 `human_review`

职责：

- 对执行前计划进行可选人工审核。

审核对象：

- `selected_tools`
- `plan`
- `execution_args`

当前阶段：

- 节点保留，但默认跳过。
- 先不接真实人审能力。

未来约束：

- 适合通过 LangGraph `interrupt()` 接入。
- 应在执行前中断，而不是执行后补审。

### 5.6 `execute`

职责：

- 只负责真正调用工具或落地执行。

输入：

- `execution_args`

输出：

- `execution_result`

明确不做：

- 不负责自然语言润色
- 不负责最终面向用户的回复生成

设计原因：

- 把副作用明确收敛到确定性执行节点中，便于调试、审计和后续扩展。

### 5.7 `response_render`（未来可选）

职责：

- 在需要自然语言回复时，将 `execution_result` 转成用户可读结果。

当前状态：

- 不进入初版 graph。
- 后续按业务需求追加。

## 6. 错误处理策略

当前已确认的错误策略如下：

- 简单错误允许重试。
- 其他问题不重试，直接上报。

建议后续在实现时把错误结构化为：

- `type`
- `message`
- `source_node`
- `retryable`

最低分类建议：

- `intent_recognition_error`
- `tool_selection_error`
- `tool_call_planning_error`
- `execution_error`

实现原则：

- 重试逻辑保持简单，不在初版引入复杂恢复分支。
- 非重试错误直接写入 `error` 并结束流程。

## 7. 工具描述协议

初版工具数量较少，但后续会开发工具注册中心，因此现在就要留出统一协议位。

建议每个工具至少具备以下描述字段：

- `name`
- `description`
- `args_schema`
- `risk_level`
- `can_interrupt`

设计原因：

- `tool_selection` 需要稳定消费工具清单。
- `tool_call_planning` 需要基于统一描述生成正规 tool call。
- `human_review` 后续需要根据风险等级决定是否中断审核。

## 8. 持久化与中断预留

当前虽未启用真实人审，但后续会接入中断能力，因此初版应提前预留持久化边界。

实现要求：

- graph 从第一版起就保留 checkpointer 接入位。
- 调用链中预留 `thread_id` 传递能力。
- `human_review` 节点未来接入 `interrupt()` 时，不应要求推翻现有主流程。

## 9. 当前唯一未决项

当前主流程上只剩一个明确未决项：

- A2A spec 对返回内容的要求，需要确认 `direct_response` 和 `execute` 之后的输出字段设计。

在该问题确认前，建议保持以下边界：

- graph 节点职责不变。
- 只暂缓最终结果字段命名和输出协议收敛。
- 不影响前面节点、路由、state 主体结构的实现。

## 10. 实现顺序建议

后续开始编码时，建议按以下顺序推进：

1. 定义结构化 state schema。
2. 搭建 graph 骨架和条件边。
3. 实现 `intent_recognition`。
4. 实现 `direct_response`。
5. 实现 `tool_selection`。
6. 实现 `tool_call_planning`。
7. 实现 `execute`。
8. 为 `human_review` 加占位节点和未来中断接口。
9. 最后再收敛 A2A 输出协议。

## 11. 当前结论

截至本文档生成时，graph 主体设计已经收敛，不再有流程层面的遗留问题。当前只保留一个接口层面的未决项：

- 等待确认 A2A spec 对返回内容的要求。

在此基础上，后续可以直接进入更细粒度的构建计划和编码设计。
