# LLM 节点开发 SOP

本文档约束 Room Agent graph 中所有 LLM 集成节点的开发方式。目标是保持获取渠道唯一、提示词构建稳定、结构化输出路径统一、输出校验最小可用。

## 1. 获取 LLM 的唯一渠道

LLM 节点禁止自行 new model，禁止直接实例化 `ChatOpenAI`，禁止绕过服务启动时创建的全局单例 registry。

唯一允许的获取方式：

1. 服务启动阶段初始化全局单例 `LLMProviderRegistry`
2. 业务节点从单例 registry 获取对应角色的 `ChatOpenAI`

参考入口：

- `room-agent/app/server.py`
- `room-agent/integrations/llm_provider.py`

约束：

- `powerful` 角色用于较强推理节点
- `low_cost` 角色用于轻量分类、直接回复等低成本节点
- 节点内部不负责模型创建、配置解析、密钥处理

## 2. 节点开发标准流程

每个 LLM 节点都按下面顺序实现：

1. 从全局单例 registry 获取 LLM
2. 明确本节点使用的角色：`powerful` 或 `low_cost`
3. 构建提示词模板
4. 判断当前任务是否需要结构化输出
5. 调用 LLM
6. 对输出做最小校验
7. 写回 graph state

禁止跳步，尤其不要在没有提示词模板和输出校验的情况下直接拼接调用。

## 3. 提示词模板规范

LLM 节点必须显式构建 prompt，不允许把业务逻辑散落在字符串拼接里。

最少包含三部分：

- `system`: 节点职责、边界、输出要求
- `context`: 当前 state 中与任务相关的原始信息
- `user`: 当前任务输入

要求：

- system prompt 只描述当前节点职责，不混入其他节点行为
- context 优先传原始数据，不传已经润色过的文本
- 如果节点要输出 JSON，prompt 中必须明确要求输出 JSON

## 4. 结构化输出判断

开发节点时，必须先判断任务是否需要结构化输出。

适合结构化输出的场景：

- 意图识别
- 工具选择
- tool call 规划
- 任何要写回结构化 state 的节点

不一定需要结构化输出的场景：

- 普通直接回复
- 纯自然语言解释

判断规则：

- 如果下游逻辑依赖字段级消费，优先使用结构化输出
- 如果结果只用于展示，可以先用文本输出

## 5. 结构化输出接入策略

如果节点需要结构化输出，优先复用标准 LangChain 路径，而不是在节点里发明新的 provider 封装。

当前要求：

- 优先复用 `room-agent/integrations/llm_provider.py`
- 结构化输出优先走 `ChatOpenAI.with_structured_output(..., method="json_schema")`
- 如果上游不支持 `json_schema`，只允许回退到普通 `ainvoke` + 本地 JSON 解析
- 不允许节点层直接接 provider 专有 SDK 能力

## 6. 输出校验要求

每个 LLM 节点都必须做最小输出校验。

文本输出最少检查：

- 非空
- 类型正确

结构化输出最少检查：

- 优先通过 `json_schema` 解码约束获取结构化结果
- 若上游不支持，再通过 `llm_json_parse.JsonParserWithRepair` 做本地解析兜底
- 关键字段存在
- 字段类型基本正确

推荐使用 Python 的 `jsonschema` 库做 schema 校验。

最低要求：

- 节点里定义最小 schema
- 先尝试 `json_schema`
- 失败后再做本地 JSON 解析
- 再做 schema 校验
- 校验失败直接报错，不静默吞掉

## 7. 节点实现模板

建议所有 LLM 节点遵循以下实现形态：

1. 从 registry 获取 `ChatOpenAI`
2. 组装 LangChain `messages`
3. 决定是否启用结构化输出
4. 调用 LLM
5. 解析响应
6. 校验响应
7. 返回 state patch

结构化输出伪代码：

```python
from langchain_core.messages import HumanMessage, SystemMessage
from llm_json_parse import JsonParserWithRepair

from integrations.llm_provider import normalize_message_content


async def some_llm_node(state: RoomAgentGraphState) -> dict:
    registry = get_llm_provider_registry()
    model = registry.get(LLMRole.LOW_COST)
    if model is None:
        raise RuntimeError(f"LLM provider is unavailable for role={LLMRole.LOW_COST.value}")

    messages = [
        SystemMessage(content="..."),
        HumanMessage(content=state["user_input"]),
    ]

    try:
        data = await model.with_structured_output(
            OUTPUT_SCHEMA,
            method="json_schema",
        ).ainvoke(messages)
    except Exception:
        raw_output = normalize_message_content(await model.ainvoke(messages))
        data = await JsonParserWithRepair()(raw_output, schema=OUTPUT_SCHEMA)

    return {
        "status": "completed",
    }
```

普通文本节点伪代码：

```python
response = await model.ainvoke(messages)
text = normalize_message_content(response).strip()
if not text:
    raise RuntimeError("LLM returned empty content.")
```

## 8. 错误处理要求

LLM 节点的错误必须显式上抛或写入结构化错误对象，不允许静默降级。

至少区分：

- 模型不可用
- 返回为空
- `json_schema` 调用失败
- JSON 本地解析失败
- schema 校验失败

错误信息应能回答三个问题：

- 哪个节点失败
- 哪一步失败
- 是否可重试

## 9. 本期边界

本期先执行最小能力开发，不展开完整结构化输出能力建设。

当前边界如下：

- 先使用全局单例 registry 作为唯一 LLM 获取入口
- 节点必须保留“是否需要结构化输出”的判断步骤
- 如需支持结构化输出，优先使用 `json_schema`
- 本地 JSON 解析只作为兜底能力
- `jsonschema` 可作为默认校验库接入

## 10. 代码评审检查项

评审 LLM 节点时，至少检查以下内容：

- 是否通过全局单例 registry 获取 LLM
- 是否明确声明使用 `powerful` 或 `low_cost`
- 是否有独立 prompt 模板
- 是否判断了结构化输出需求
- 是否优先使用 `json_schema` 并保留本地解析兜底
- 是否把错误处理成可观测形式

不满足以上任一项的实现，不应直接合入。

## 11. Room Agent 测试执行注意事项

Room Agent 的测试命令必须在 `room-agent/` 子项目目录下执行。

原因：

- `pytest` 是声明在 `room-agent/pyproject.toml` 的子项目依赖里，不在仓库根目录环境里
- 从仓库根目录直接执行 `uv run pytest ...`，拿到的不是 `room-agent` 的依赖环境

推荐命令：

```bash
cd room-agent
env UV_CACHE_DIR=/tmp/uv-cache uv run pytest tests/test_config_settings.py -q
```

补充约束：

- 在 Codex 沙箱里优先显式设置 `UV_CACHE_DIR=/tmp/uv-cache`
- 默认 `~/.cache/uv` 可能因为沙箱限制导致 `Operation not permitted`
- 如果 `room-agent/.venv/` 已经存在，优先直接使用 `room-agent/.venv/bin/pytest` 或 `room-agent/.venv/bin/python`
- `uv run --with ...` 在沙箱里更容易遇到缓存权限或临时环境异常，不应作为 Room Agent 测试的第一选择
- 需要 `uv sync`、安装依赖或创建新环境时，先判断是否要提权；若因沙箱/网络失败，应直接按提权流程重试
- 仓库迁移到新的 workspace 或绝对路径变化后，先清掉并重建 `room-agent/.venv`，避免旧路径残留造成解释器或依赖异常
