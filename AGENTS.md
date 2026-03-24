# Python Package Publishing

本文档说明仓库中 Python 包的发布管理流程。

## 配置：`scripts/python-publish.json`

### 功能

`python-publish.json` 是 VCS 管理的包发布列表，定义了哪些 Python 包需要发布到私有 registry。

### 配置格式

```json
{
  "description": "Python packages to publish. This configuration is used by CI workflows.",
  "packages": [
    {
      "name": "包名",
      "path": "相对路径",
      "publish": true,
      "description": "包描述"
    }
  ]
}
```

字段说明：

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | string | 包的显示名称 |
| `path` | string | 包在仓库中的相对路径（包含 `pyproject.toml`） |
| `publish` | boolean | 是否发布；`false` 时跳过该包 |
| `description` | string | 包功能描述 |

### 当前配置

```json
{
  "packages": [
    {
      "name": "llm-json-parse",
      "path": "shared/llm-json-parse",
      "publish": true,
      "description": "JSON parsing with LLM fallback"
    },
    {
      "name": "room-agent",
      "path": "room-agent",
      "publish": true,
      "description": "Room intelligent agent with Google A2A support"
    }
  ]
}
```

## 脚本：`scripts/publish_python_package.py`

### 功能

读取 `python-publish.json` 配置，批量构建和发布 Python 包到私有 registry。

### 使用方式

#### 1. 基础用法（从配置发布）

```bash
python scripts/publish_python_package.py \
  --repository-url https://pypi.mcurobot.com/root/agent-smart-home-system \
  --username <username> \
  --password <token>
```

环境变量替代：

```bash
export PACKAGE_REPOSITORY_URL=https://pypi.mcurobot.com/root/agent-smart-home-system
export PACKAGE_REPOSITORY_USERNAME=<username>
export PACKAGE_REPOSITORY_PASSWORD=<token>

python scripts/publish_python_package.py
```

#### 2. 仅构建，不上传

```bash
python scripts/publish_python_package.py --skip-upload
```

#### 3. 跳过重复的包（--skip-existing）

```bash
python scripts/publish_python_package.py --skip-existing
```

#### 4. 保留现有 dist 文件

```bash
python scripts/publish_python_package.py --keep-dist
```

#### 5. 单个包发布（遗留支持）

```bash
python scripts/publish_python_package.py --package-dir shared/llm-json-parse
```

### 参数说明

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `--config` | `scripts/python-publish.json` | 包配置文件路径 |
| `--package-dir` | - | 发布单个包（覆盖 --config） |
| `--repository-url` | `$PACKAGE_REPOSITORY_URL` | Registry URL |
| `--username` | `$PACKAGE_REPOSITORY_USERNAME` | Registry 用户名 |
| `--password` | `$PACKAGE_REPOSITORY_PASSWORD` | Registry 密码/token |
| `--skip-upload` | - | 仅构建，不上传 |
| `--keep-dist` | - | 保留现有 dist 文件，不重新清理 |
| `--skip-existing` | - | 传递给 twine，跳过已存在的版本 |

## 工作流：`.github/workflows/publish-python-packages.yml`

### 触发条件

- 推送到 `master` 分支

### 执行步骤

1. 检出代码
2. 安装 Python 3.12
3. 安装 uv
4. 执行 `python scripts/publish_python_package.py`

### 环境变量

从 GitHub 获取 registry 凭证：

- `PRIVATE_PYPI_URL` (vars)
- `PRIVATE_PYPI_USERNAME` (secrets)
- `PRIVATE_PYPI_PASSWORD` (secrets)

## 管理 python-publish.json

### 添加新包

1. 在 `python-publish.json` 中添加包条目
2. 确保 `path` 指向正确的包目录
3. 设置 `publish: true`
4. 提交到 VCS

示例：

```json
{
  "name": "new-package",
  "path": "path/to/new-package",
  "publish": true,
  "description": "新包描述"
}
```

### 临时禁用发布

将 `publish` 设为 `false`，无需删除配置条目：

```json
{
  "name": "package-name",
  "path": "path/to/package",
  "publish": false,
  "description": "暂时禁用"
}
```

### 删除包配置

直接从数组中移除对应条目。

## 常见问题

**Q: 如何测试发布流程但不实际上传？**

A: 使用 `--skip-upload` 参数。脚本仍会构建所有包，生成 artifacts。

**Q: 为什么我的包没有被发布？**

A: 检查以下几点：

1. 包在 `python-publish.json` 中存在且 `publish: true`
2. 包目录中有 `pyproject.toml`
3. Registry 凭证正确
4. 网络连接正常

**Q: 能否只发布单个包？**

A: 可以，用 `--package-dir` 参数指定路径，这是遗留支持的方式。但推荐修改 `python-publish.json` 中对应包的 `publish` 字段。

## Codex 环境约定

以下约定用于避免 Codex/沙箱环境下反复踩坑，默认应优先遵守：

- 涉及 Python 子项目时，优先使用子项目自己的 `.venv/bin/python`、`.venv/bin/pytest`、`.venv/bin/<tool>`，不要先假设仓库根环境可用。
- 需要 `uv` 解析依赖、创建临时环境或执行 `uv sync` / `uv run --with ...` 时，优先预判为可能需要提权；如果先在沙箱内执行失败，再立即按提权流程重跑，不要反复尝试。
- 在 Codex 沙箱里运行 `uv` 时，优先显式设置 `UV_CACHE_DIR=/tmp/uv-cache`，避免默认 `~/.cache/uv` 因权限限制报 `Operation not permitted`。
- `git` 写操作同样按提权路径处理，尤其是 `git commit`、需要写入索引或 `.git/` 元数据时，不要先在沙箱里反复试错。
- 如果子项目已经有可用 `.venv`，优先直接使用该环境跑测试；不要为了临时测试优先走 `uv run --with ...`。
- 当仓库被移动到新的 workspace、绝对路径变化，或直接拷贝了旧 workspace 时，先删除并重建各子项目 `.venv`，避免旧虚拟环境残留路径导致解释器、脚本入口或依赖解析异常。
- 遇到“本地 fixture 存在但网络请求仍失败”的测试，要先区分是凭据问题还是外网连通性问题；不能把这类失败误判成代码回归。
