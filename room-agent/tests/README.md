# Tests

当前 `room-agent/tests` 主要保留一组最小真实端点 smoke test，用于验证当前 graph 在真实 LLM 配置下的基础分流行为。

运行方式：

```bash
uv run --project room-agent --with pytest pytest room-agent/tests/test_graph_smoke.py -q
```

Fixture 配置说明：

- `room-agent/tests/fixtures/llm.yaml` 不纳入版本控制
- 你需要在本地自行创建这份文件
- 它的结构应与示例 LLM 配置一致，并为 `low_cost` / `powerful` 角色填入可用模型配置和真实 `api_key`

可参考：

- `room-agent/config/examples/llm.example.yaml`
