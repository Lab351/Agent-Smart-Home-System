# GitHub 原生 Webhook 替代 Actions 方案调研

## TL;DR

**可以不靠 Actions 实现。** GitHub 自带仓库级 Webhook 事件系统，在每次 push 时直接将完整的提交元数据 POST 到指定 URL，全程零成本、零延迟。只需在外部部署一个轻量 Serverless Worker（Cloudflare Workers 免费额度足够）做格式转换，即可替代原有的 Actions 方案。

---

## 1. GitHub 原生 Webhook 机制

GitHub 在仓库/组织层面内置了 Webhook 事件系统，无需任何 CI/CD 配置：

| 能力 | 说明 |
|------|------|
| 触发事件 | `push`、`pull_request`、`release` 等 [50+ 事件类型](https://docs.github.com/en/webhooks/webhook-events-and-payloads) |
| 配置位置 | 仓库 → Settings → Webhooks → Add webhook |
| 传输方式 | GitHub 服务器直接 HTTP POST 到你配置的 URL |
| 延迟 | 毫秒级（GitHub 内部触发，不经过 Runner 排队） |
| 费用 | **完全免费**，无次数限制 |
| Payload | 包含完整提交元数据（提交人、分支、消息、URL 等） |
| 安全 | 支持 HMAC-SHA256 签名验证（`X-Hub-Signature-256` 请求头） |

### push 事件 Payload 结构（相关字段）

```json
{
  "ref": "refs/heads/codex/114514",
  "head_commit": {
    "id": "abc123...",
    "message": "docs: 文档更新",
    "url": "https://github.com/org/repo/commit/abc123...",
    "author": {
      "name": "提交人",
      "email": "user@example.com"
    }
  },
  "repository": {
    "html_url": "https://github.com/org/repo"
  }
}
```

这些字段与我们需要的目标 payload 直接对应，**无需 Actions 环境变量拼接**。

---

## 2. 架构对比

### 当前方案（GitHub Actions）

```
git push
  └─► GitHub 排队等 Runner
        └─► Runner 启动（~10-30s）
              └─► curl POST 到目标 Webhook
```

**问题**：
- 每次推送消耗 Runner 分钟数（私有仓库每月 2000 分钟免费额度）
- Runner 启动有排队延迟
- 通知逻辑与 CI/CD 流水线耦合

### 替代方案（GitHub Webhook + Serverless Worker）

```
git push
  └─► GitHub 原生 Webhook（毫秒级触发）
        └─► Serverless Worker（Cloudflare Workers / AWS Lambda 等）
              └─► 格式转换
                    └─► POST 到目标 Webhook
```

**优势**：
- GitHub 原生 Webhook 免费、无排队
- Serverless Worker 按需计费，成本极低（见下文）
- 通知逻辑独立部署，不占用 CI/CD 资源

---

## 3. Serverless 平台成本对比

| 平台 | 免费额度 | 超出单价 | 冷启动延迟 | 适合场景 |
|------|---------|---------|-----------|---------|
| **Cloudflare Workers** | 100,000 req/天，无时间限制 | $0.50/百万次 | **无**（V8 Isolate） | ✅ 推荐首选 |
| AWS Lambda | 1,000,000 req/月 + 400,000 GB-s | $0.20/百万次 | 100ms~1s | 已有 AWS 基础设施时 |
| Vercel Edge Functions | 500,000 req/月 | 按套餐 | 无 | 已有 Vercel 项目时 |
| Azure Functions | 1,000,000 req/月 | $0.20/百万次 | 100ms~1s | 已有 Azure 基础设施时 |

本仓库推送频率远低于任何平台的免费额度，**实际成本为零**。

推荐使用 **Cloudflare Workers**：
- 无冷启动，延迟最低
- 免费套餐最宽裕
- 部署极简（`wrangler deploy` 一行命令）

---

## 4. 实施步骤

### Step 1：部署 Cloudflare Worker

代码见 [`workers/commit-notify/index.js`](../workers/commit-notify/index.js)。

```bash
# 安装 Wrangler CLI
npm install -g wrangler

cd workers/commit-notify

# 设置目标 Webhook URL（加密存储，不写进代码）
wrangler secret put NOTIFY_WEBHOOK_URL
# 输入你的目标 Webhook URL，回车确认

# （可选）设置 GitHub Webhook Secret 用于签名验证
wrangler secret put GITHUB_WEBHOOK_SECRET
# 输入与 GitHub Webhook 配置一致的密钥，回车确认

# 部署
wrangler deploy
# 输出类似：https://commit-notify.<your-subdomain>.workers.dev
```

### Step 2：配置 GitHub 仓库 Webhook

1. 进入仓库 → **Settings** → **Webhooks** → **Add webhook**
2. 填写以下字段：

| 字段 | 值 |
|------|---|
| Payload URL | `https://commit-notify.<your-subdomain>.workers.dev` |
| Content type | `application/json` |
| Secret | （与 `GITHUB_WEBHOOK_SECRET` 一致，可留空跳过验证） |
| Which events | 选 **Just the push event** |
| Active | ✅ 勾选 |

3. 点击 **Add webhook**，GitHub 会发送一条 `ping` 事件验证连通性。

### Step 3：验证

推送一个测试提交，在 GitHub Webhook 页面的 **Recent Deliveries** 标签页可以看到：
- 请求/响应详情
- HTTP 状态码（200 = 成功）

---

## 5. 安全说明

Worker 代码实现了 HMAC-SHA256 签名验证（`X-Hub-Signature-256`）。当 `GITHUB_WEBHOOK_SECRET` 环境变量已设置时，所有未通过签名验证的请求会被拒绝（返回 `401`），防止伪造请求。

若暂时不设置 Secret，Worker 会跳过验证并正常处理请求——适合快速测试阶段。

---

## 6. 与现有 Actions 方案的关系

两种方案**功能上等价**，可以并存或二选一：

| | GitHub Actions（已有） | Serverless Worker（本方案） |
|--|----------------------|---------------------------|
| 部署位置 | 仓库内 `.github/workflows/` | 外部 Cloudflare Workers |
| 触发速度 | ~15-30s（Runner 排队） | <1s（原生 Webhook） |
| Runner 消耗 | 是 | 否 |
| 维护位置 | 仓库内 | 独立 Worker 项目 |
| 配置门槛 | 低（仓库 Secret） | 略高（需注册 Cloudflare 账号） |

**建议**：如果推送频率不高、对通知延迟不敏感，现有 Actions 方案已足够。如果希望零成本、低延迟且不占用 Runner 额度，迁移到 Serverless Worker 方案。

---

**相关文件**：
- Worker 实现：[`workers/commit-notify/index.js`](../workers/commit-notify/index.js)
- 现有 Actions 方案：[`.github/workflows/notify-webhook.yml`](../.github/workflows/notify-webhook.yml)
