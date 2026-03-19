# llm-json-parse

用于解析和修复 LLM 返回的 JSON 文本的共享库。

- 包名（发布名）：`llm-json-parse`
- 导入名（Python import）：`llm_json_parse`

## 安装

如果单独使用本包：

```bash
uv add llm-json-parse
```

## 在 monorepo 中以源码方式引用

下面是“在 monorepo 的另一个项目中，直接引用本包源码”的推荐做法。

### 方式一：Path 依赖（最直接）

在消费方项目的 `pyproject.toml` 中添加：

```toml
[project]
dependencies = [
  "llm-json-parse"
]

[tool.uv.sources]
llm-json-parse = { path = "../../shared/llm-json-parse", editable = true }
```

然后在消费方项目目录执行：

```bash
uv sync
```

说明：

- `editable = true` 表示开发模式联动，修改共享包源码后，消费方可立即看到变更。
- 路径需要按你的 monorepo 实际目录调整。

### 方式二：uv workspace（更规范的 monorepo 管理）

在 monorepo 根目录 `pyproject.toml` 中声明 workspace：

```toml
[tool.uv.workspace]
members = [
  "shared/llm-json-parse",
  "apps/your-consumer"
]
```

在消费方项目 `pyproject.toml` 中添加：

```toml
[project]
dependencies = [
  "llm-json-parse"
]

[tool.uv.sources]
llm-json-parse = { workspace = true }
```

然后在 monorepo 根目录执行：

```bash
uv sync
```

## 验证引用是否生效

在消费方项目中执行：

```bash
uv run python -c "import llm_json_parse; print(llm_json_parse.__all__)"
```

如果能正常输出 `['JsonRepairError', 'JsonParserWithRepair', 'create_openai_provider']`，说明引用成功。

## 快速示例

提供大模型集成

```python
from llm_json_parse import JsonParserWithRepair, create_openai_provider

llm_provider = create_openai_provider(
  model="gpt-3.5-turbo",
  api_key="your-openai-api-key",
  base_url="https://api.openai.com/v1",
)

parser = JsonParserWithRepair(llm_provider=llm_provider)
```

修复字符串

```python
from llm_json_parse import JsonParserWithRepair


parser = JsonParserWithRepair()


async def run(parser_text: str):
  result = await parser(parser_text)
  return result
```
