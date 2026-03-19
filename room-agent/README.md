# Room Agent

当前 `room-agent` 已切到新的 LangGraph 工作流骨架。旧的数字人 / WebSocket / 前端接入说明已经失效，不再适用。

## 当前能力

当前最小流程如下：

- `intent_recognition`
- `direct_response`
- `tool_selection`（占位）

其中：

- `intent_recognition` 使用低成本模型判断是否需要工具调用
- `direct_response` 在不需要工具时直接生成一条自然语言回复
- `tool_selection` 当前还是占位节点

## 依赖安装

在仓库根目录执行：

```bash
uv sync --project room-agent
```

如果你只想跑单次 CLI 或服务启动，推荐都从项目根目录用 `--project room-agent` 调用。

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

## 运行单次集成测试 CLI

从仓库根目录执行：

```bash
uv run --project room-agent python room-agent/app/test_cli.py "你好" \
  --config room-agent/config/examples/room_agent.example.yaml \
  --llm-config room-agent/config/examples/llm.example.yaml
```

成功时会输出 graph 最终 state 的 JSON。

如果 `low_cost` 模型不可用，会直接报错：

```text
ValueError: Low-cost LLM provider is unavailable.
```

这通常说明：

- `llm` 配置里没有给 `low_cost` 角色配置有效模型
- 或者 `api_key` 为空

## 启动服务

当前服务入口仍然是：

- `room-agent/app/server.py`

从仓库根目录启动：

```bash
ROOM_AGENT_CONFIG_PATH=room-agent/config/examples/room_agent.example.yaml \
ROOM_AGENT_LLM_CONFIG_PATH=room-agent/config/examples/llm.example.yaml \
uv run --project room-agent python room-agent/app/server.py
```

说明：

- 服务启动时会初始化全局单例 `Settings`
- 服务启动时会初始化全局单例 `LLMProviderRegistry`
- 当前业务 loop 仍然是占位实现
- A2A HTTP 服务入口已保留

## 开发约定

LLM 节点开发规范见：

- `room-agent/graph/AGENT.md`

其中最重要的约束有两条：

- LLM 只能通过服务启动时创建的全局单例 registry 获取
- 结构化输出解析统一复用 `shared.llm.parse_json_with_repair`

## 现状说明

当前仓库状态适合继续做以下开发：

- 完善 `tool_selection`
- 增加 tool call planning
- 接入人审占位节点
- 完善真实工具执行路径

不建议再参考旧版 room-agent 的历史业务结构，新的 graph 方案已经作为后续实现基线。
