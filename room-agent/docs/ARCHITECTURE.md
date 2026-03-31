# Room Agent 架构现状

本文档描述 Room Agent 当前的 LangGraph 实现架构，供后续开发参考。

## 核心架构

Room Agent 基于 LangGraph 构建，采用 ReAct 风格的 Agent 执行模式。

### 主工作流

```
START
  -> initialize_request
  -> intent_recognition (low_cost LLM)
    -> if need_tool_call = false: direct_response (low_cost LLM) -> END
    -> if need_tool_call = true: tool_selection
      -> agent_execution (subgraph, powerful LLM)
        -> END
```

### Agent Execution 子图

完整的 ReAct Agent 实现，支持多步迭代（最多6步）：

- `agent_plan_step` - 规划下一步行动
- `agent_execute_toolcall` - 执行 MCP 工具调用
- `agent_record_reason` - 记录推理过程
- `agent_finalize_output` - 生成最终输出

支持工具调用失败后的 replan 机制。

## 核心组件

### LLM Registry

- 全局单例 `LLMProviderRegistry`（`integrations/llm_provider.py`）
- 两种角色：
  - `powerful` - 复杂推理（agent planning）
  - `low_cost` - 轻量任务（意图识别、直接回复）
- registry 直接返回基于 `langchain-openai` 初始化好的 `ChatOpenAI`
- 支持角色间 fallback

### MCP 集成

- 基于 `langchain-mcp-adapters`
- 启动时健康检查 Home Assistant MCP
- 工具信息动态获取

### 结构化输出

- 优先使用 `ChatOpenAI.with_structured_output(..., method="json_schema")`
- 失败时回退到 `llm-json-parse` 的 `JsonParserWithRepair` 本地修复
- 所有 LLM 节点定义 JSON schema 进行校验

### A2A 服务

- HTTP 服务入口（`app/a2a_server.py`）
- 支持 Google A2A 协议
- 占位 fallback 响应

## 已实现功能

- ✓ 完整 LangGraph 工作流
- ✓ 意图识别与直接回复
- ✓ 工具选择与 Agent 执行
- ✓ MCP 客户端集成
- ✓ A2A HTTP 服务
- ✓ 多层 LLM fallback
- ✓ 配置管理系统

## 未实现功能

- ✗ Backend Gateway 注册（占位实现，等待协议对齐）
- ✗ 事件发送机制
- ✗ 规则引擎与非智能 fallback 路径
- ✗ 人工审核节点（预留但未启用）

## 开发约定

详见 `graph/AGENTS.md`：

- LLM 只能通过全局单例 registry 获取
- 结构化输出优先走 `json_schema`，本地修复只做兜底
- 每个节点定义独立的 prompt 模板和 schema
- 错误必须显式上抛或写入结构化对象

## 配置文件

- `config/examples/room_agent.example.yaml` - Agent 配置
- `config/examples/llm.example.yaml` - LLM 配置

## 启动服务

```bash
cd room-agent
uv run serve \
  --config-path config/examples/room_agent.example.yaml \
  --llm-config-path tests/fixtures/llm.yaml
```

## 技术栈

- LangGraph 1.0+ - 工作流编排
- LangChain Core - 消息和工具抽象
- langchain-mcp-adapters - MCP 协议适配
- a2a-sdk - Google A2A 协议
- llm-json-parse - 结构化输出解析
