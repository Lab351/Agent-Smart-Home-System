# Tests

当前 `room-agent/tests` 主要保留一组最小真实端点 smoke test，用于验证当前 graph 在真实 LLM 配置下的基础分流行为。

运行方式：

```bash
uv run --project room-agent --with pytest pytest room-agent/tests/test_graph_smoke.py -q
```

Fixture 配置说明：

- `room-agent/tests/fixtures/llm.yaml` 当前只保留脱敏模板，不能直接当作真实凭证文件使用
- 做真实 smoke test 时，请复制它或 `room-agent/config/examples/llm.example.yaml` 到你自己的私有路径
- 私有配置应为 `low_cost` / `powerful` 角色填入可用模型配置和真实 `api_key`

可参考：

- `room-agent/config/examples/llm.example.yaml`

## Tool Selection 人工验证

如果你要验证 `tool_selection` 在真实 LLM 配置下是否能把常见请求映射到正确工具，推荐保留一份真实 MCP `tools/list` 返回作为样本，例如 `/tmp/listresult.json`。

建议至少覆盖下面这组样例：

- `开灯` -> `HassTurnOn`
- `把空调调到26度` -> `HassClimateSetTemperature`
- `把门锁上` -> `HassTurnOn`
- `现在几点` -> `GetDateTime`
- `现在客厅灯状态如何` -> `GetLiveContext`

如果通过 A2A 服务验证，不要把 graph state 暴露给 client。当前约定是：

- A2A task result 只返回最终对用户可见的文本
- graph 最终 `state` 只记录在服务端日志里

因此手工联调时建议：

1. 用 `scripts/a2a_debug_client.py` 发送请求
2. 在 room-agent 服务日志里查 `RoomAgent graph final state`
3. 从日志中的 `selected_tools` 和 `execution_result.comment` 判断工具选择是否符合预期
