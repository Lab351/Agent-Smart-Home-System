# Room Agent

当前 `room-agent` 已切到新的 LangGraph 工作流骨架。旧的数字人 / WebSocket / 前端接入说明已经失效，不再适用。

## 当前能力

- A2A + LangGraph 链路基本完整
- Backend Gateway 注册占位实现（等待协议对齐）
- 事件发送未实现

## 依赖安装

推荐先进入 `room-agent/` 子项目目录，再执行本项目自己的命令。

在仓库根目录初始化依赖时可以执行：

```bash
uv sync --project room-agent
```

如果你已经有 `room-agent/.venv/`，后续调试优先直接使用该环境里的入口，不要先假设仓库根环境可用。

在 Codex 或沙箱环境里如果必须使用 `uv`，优先显式设置：

```bash
env UV_CACHE_DIR=/tmp/uv-cache ...
```

## 配置文件

当前运行需要两份配置：

- Room Agent 配置
- LLM 配置

示例文件：

- `room-agent/config/examples/room_agent.example.yaml`
- `room-agent/config/examples/llm.example.yaml`

注意：

- `llm.example.yaml` 里的 `api_key` 默认是空的
- 如果 `low_cost` 角色没有可用凭证，graph 无法运行
- `tests/fixtures/*.yaml` 现在只保留脱敏模板；做真实联调前请先在你自己的私有配置文件里填入真实 `api_key` / `auth_token`
- `room_agent.example.yaml` 支持在 `agent.home_assistant_mcp` 下配置 Home Assistant `base_url`，MCP client 会自动拼成 `{base_url}/api/mcp`
- Home Assistant MCP 默认按 `streamable_http` transport 配置，启动时会做一次 prompts 探活；失败只记录状态，不会中断服务

## 运行单次集成测试 CLI

从 `room-agent/` 目录执行：

```bash
cd room-agent
.venv/bin/python app/test_cli.py "你好" \
  --config config/examples/room_agent.example.yaml \
  --llm-config /path/to/private-llm.yaml
```

成功时会输出 graph 最终 state 的 JSON。

如果你更偏好 `uv` 入口，也可以执行：

```bash
cd room-agent
env UV_CACHE_DIR=/tmp/uv-cache uv run python app/test_cli.py "你好" \
  --config config/examples/room_agent.example.yaml \
  --llm-config /path/to/private-llm.yaml
```

如果 `low_cost` 模型不可用，会直接报错：

```text
ValueError: Low-cost LLM provider is unavailable.
```

这通常说明：

- `llm` 配置里没有给 `low_cost` 角色配置有效模型
- 或者 `api_key` 为空

## 启动服务

当前正式服务入口是 `pyproject.toml` 中声明的 console script：

- `serve = "app.server:cli"`

从 `room-agent/` 目录启动：

```bash
cd room-agent
uv run serve \
  --config-path config/examples/room_agent.example.yaml \
  --llm-config-path /path/to/private-llm.yaml
```

说明：

- 服务启动时会初始化全局单例 `Settings`
- 服务启动时会初始化全局单例 `LLMProviderRegistry`，registry 直接提供按角色配置好的 `ChatOpenAI`
- 服务启动时会初始化全局单例 `MCP client`，并执行一次 Home Assistant MCP 健康检查
- 当前业务 loop 仍然是占位实现
- A2A HTTP 服务入口已保留
- 不要直接执行 `python app/server.py` 或 `python -m app.server`
- 如果已经 `uv sync` 过，也可以直接用 `.venv/bin/serve ...`

## A2A 调试

仓库根目录下提供了一个最小调试脚本：

- `scripts/a2a_debug_client.py`

推荐先启动服务，再按下面顺序验证：

1. 先拉 agent card
2. 再发送一条普通聊天消息
3. 最后再发送设备控制或续话请求

从 `room-agent/` 目录执行：

```bash
cd room-agent
uv run a2at --url http://127.0.0.1:10000 card
```

```bash
cd room-agent
uv run a2at --url http://127.0.0.1:10000 send "你好"
```

```bash
cd room-agent
uv run a2at --url http://127.0.0.1:10000 get-task <task_id>
```

## 已知坑 / Troubleshooting

- 直接执行 `python app/server.py` 或 `python -m app.server` 会在 `__main__` 下创建独立模块实例，graph 节点读取不到同一份全局配置。当前入口已显式禁止这种启动方式。
- 如果你看到 `room-agent config path is required.`，先检查是不是绕过了 `serve` console script。
- 在 Codex 沙箱里，本地端口绑定可能需要提权；服务起不来时先区分是代码问题还是沙箱限制。
- A2A 调试时优先先打 `card`，确认服务已监听，再打 `send`。不要一开始就把错误归因到 graph 逻辑。
- 如果仓库被移动到新的 workspace 或复制了旧环境，先删除并重建 `room-agent/.venv/`，避免旧绝对路径残留导致解释器或依赖异常。

## 开发约定

LLM 节点开发规范见：

- `room-agent/graph/AGENTS.md`

其中最重要的约束有两条：

- LLM 只能通过服务启动时创建的全局单例 registry 获取 `ChatOpenAI`
- 结构化输出优先使用 `json_schema` 解码约束，失败时再走 `llm_json_parse.JsonParserWithRepair` 的本地修复
