# Worker-3 测试与证据报告

## 范围
- 目标：给出可复现测试证据、代码位置、风险级别、影响面、失败/利用路径与修复建议。
- 结论：本轮主要发现 1 个已在当前 working tree 中缓解的功能性回归点，另有 1 个低风险 lint 卫生项。

## 发现 1：`tool_selection` 对 runtime `settings` 形状假设过强，曾导致工具调用路径直接崩溃

- **风险级别**：中
- **当前状态**：已在当前 working tree 中缓解（`graph/nodes/tool_selection.py:105-117` 已加守卫）
- **代码位置**：
  - `app/server.py:54-78`：`initialize_runtime_dependencies()` / `get_settings()` 将传入对象直接保存为全局 `_SETTINGS`
  - `tests/test_graph_smoke.py:185-189`：smoke test 故意注入 `settings=object()`
  - `tests/test_a2a_server.py:254-260`：A2A smoke test 同样注入 `settings=object()`
  - `graph/nodes/tool_selection.py:102-122`：构建 MCP prompt context；当前版本已改为 `getattr(...)` + `None` 降级

### 基线失败证据（修复前工作区）
命令：

```bash
.venv/bin/pytest -q
```

结果（首次基线采集）：
- `14 passed, 3 failed`
- 失败用例：
  - `tests/test_a2a_server.py::test_a2a_tool_smoke_emits_tool_status_updates`
  - `tests/test_graph_smoke.py::test_graph_smoke_executes_tool_call_with_toolnode`
  - `tests/test_graph_smoke.py::test_graph_smoke_returns_structured_failure_when_tool_raises`

失败栈关键点：
- `graph/nodes/tool_selection.py:_build_mcp_prompt_context()`
- 异常：`AttributeError: 'object' object has no attribute 'agent'`

### 影响面
- **直接影响**：所有经过 `tool_selection` 节点的工具调用 smoke path。
- **外溢影响**：
  - Graph 工具执行路径无法进入后续 ToolNode / agent execution。
  - A2A 层无法发出完整的工具执行状态更新，导致端到端回归证据失真。
  - CI 中这类 smoke test 会变成“基础设施形状错误”而不是“真实业务回归”信号。

### 失败/利用路径
1. 测试或错误初始化代码调用 `initialize_runtime_dependencies(settings=object(), ...)`
2. `_SETTINGS` 被写成不含 `.agent.home_assistant_mcp` 的对象
3. 请求进入 `tool_selection`
4. `_build_mcp_prompt_context()` 访问运行时设置
5. 若无守卫，`settings.agent.home_assistant_mcp` 直接触发 `AttributeError`
6. 图执行中断，工具状态与最终响应无法按预期产出

> 这更像“失败路径”而非安全漏洞；但它会放大错误初始化或低保真 test double 的破坏面。

### 修复建议
1. **保留当前守卫式实现**：`graph/nodes/tool_selection.py:105-117` 先判空 client，再通过 `getattr` 提取 `agent/home_assistant_mcp/server_name`，缺失时降级为空 prompt context。
2. **收紧测试夹具契约**：将 `settings=object()` 改为 `Settings.model_construct(...)` 或定义最小 Protocol/Stub，减少“测试双对象形状不合法”噪音。
3. **补充回归断言**：保留/新增一条回归用例，显式覆盖“无 `home_assistant_mcp` / 无法加载 settings 时不应阻断工具调用”。

## 发现 2：`app/server.py` 存在已知 lint 噪音（E402）

- **风险级别**：低
- **代码位置**：`app/server.py:25-29`
- **证据命令**：

```bash
env UV_CACHE_DIR=/tmp/uv-cache uv run --with ruff ruff check \
  graph/nodes/tool_selection.py tests/test_graph_smoke.py tests/test_a2a_server.py \
  app/server.py graph/mcp_prompt_context.py
```

- **结果**：`Found 5 errors`，均为 `E402 Module level import not at top of file`
- **影响面**：
  - 不阻断运行时行为；
  - 但会让 lint 门禁持续报红，掩盖真正的新问题。
- **失败路径**：
  - 文件顶部为防止直接执行而保留了 `if __name__ == "__main__" ... raise SystemExit(...)`
  - 其后的导入触发 Ruff `E402`
- **修复建议**：
  1. 若该布局是有意为之，添加局部 `# noqa: E402` / Ruff per-file ignore；或
  2. 将直接执行保护改写为函数化入口，恢复导入位于文件顶部。

## 当前验证（基于当前 working tree）

### PASS
- `./.venv/bin/pytest tests/test_server_mcp_runtime.py -q` → `4 passed in 0.79s`
- `./.venv/bin/pytest tests/test_graph_smoke.py::test_graph_smoke_executes_tool_call_with_toolnode -q` → `1 passed in 0.85s`
- `./.venv/bin/pytest -q` → `18 passed in 1.10s`
- `lsp_diagnostics(graph/nodes/tool_selection.py)` → `0 diagnostics`

### FAIL / 待处理
- `env UV_CACHE_DIR=/tmp/uv-cache uv run --with ruff ruff check ...` → `5 x E402 in app/server.py:25-29`

## 汇总判断
- 当前工作区里，`tool_selection` 的空值防御已经把核心功能回归从 **FAIL** 拉回到 **PASS**。
- 剩余最明确的问题是 `app/server.py` 的 lint 噪音；它是 **低风险工程卫生问题**，不影响当前 18 条测试通过，但建议尽快收口，避免影响后续门禁可读性。
