# Qwen Backend - Nest.js 服务

为 watch-agent 提供安全的 Qwen AI 对话后端服务。

## 功能特性

- ✅ 使用 Nest.js 框架构建，结构清晰
- ✅ 集成 DashScope Qwen AI 模型
- ✅ 保护 API Key 安全（仅存在服务器端）
- ✅ 支持多轮对话上下文
- ✅ CORS 配置，支持快应用调用
- ✅ Docker 支持，便于 VPS 部署

## 项目结构

```
qwen-backend/
├── src/
│   ├── chat/           # 聊天模块
│   │   ├── dto/        # 数据传输对象
│   │   ├── chat.controller.ts
│   │   └── chat.module.ts
│   ├── qwen/           # Qwen 服务模块
│   │   ├── qwen.service.ts
│   │   └── qwen.module.ts
│   ├── app.module.ts
│   └── main.ts
├── .env.example        # 环境变量模板
├── Dockerfile          # Docker 构建文件
├── docker-compose.yml  # Docker Compose 配置
└── package.json
```

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env`：

```bash
cp .env.example .env
```

编辑 `.env` 文件，填入你的 DashScope API Key：

```env
DASHSCOPE_API_KEY=sk-your-api-key-here
DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
DASHSCOPE_MODEL=qwen-plus
PORT=3000
```

### 3. 本地运行

```bash
# 开发模式（热重载）
npm run start:dev

# 生产模式
npm run build
npm run start:prod
```

服务将在 `http://localhost:3000` 启动。

## API 接口

### POST /chat

发送聊天消息给 Qwen AI。

**请求体：**

```json
{
  "message": "你好",
  "conversationHistory": [
    { "role": "user", "content": "上一条消息" },
    { "role": "assistant", "content": "上一条回复" }
  ],
  "systemPrompt": "You are a helpful assistant."
}
```

**响应：**

```json
{
  "success": true,
  "data": {
    "message": "你好！我是Qwen，很高兴为你服务。"
  }
}
```

## VPS 部署

### 使用 Docker Compose（推荐）

1. **上传代码到 VPS**

```bash
scp -r qwen-backend/ user@your-vps-ip:/path/to/app/
```

2. **配置环境变量**

在 VPS 上创建 `.env` 文件并配置 API Key。

3. **启动服务**

```bash
cd /path/to/app/qwen-backend
docker-compose up -d
```

4. **查看日志**

```bash
docker-compose logs -f
```

5. **停止服务**

```bash
docker-compose down
```

### 使用 Docker

1. **构建镜像**

```bash
docker build -t qwen-backend .
```

2. **运行容器**

```bash
docker run -d \
  --name qwen-backend \
  -p 3000:3000 \
  --env-file .env \
  --restart unless-stopped \
  qwen-backend
```

3. **查看日志**

```bash
docker logs -f qwen-backend
```

### 使用 PM2

如果你更喜欢直接运行 Node.js 而不是 Docker：

1. **安装 PM2**

```bash
npm install -g pm2
```

2. **构建并启动**

```bash
npm run build
pm2 start dist/main.js --name qwen-backend
pm2 save
pm2 startup
```

3. **管理服务**

```bash
pm2 status          # 查看状态
pm2 logs qwen-backend  # 查看日志
pm2 restart qwen-backend  # 重启
pm2 stop qwen-backend     # 停止
```

## Nginx 反向代理配置（可选）

如果你已经有 Nginx 运行，可以配置反向代理：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location /api/qwen {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## 防火墙配置

确保 VPS 防火墙允许 3000 端口：

```bash
# UFW (Ubuntu)
sudo ufw allow 3000/tcp

# firewalld (CentOS)
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --reload
```

## 安全建议

1. **使用 HTTPS**: 在生产环境，建议使用 Nginx + Let's Encrypt 配置 HTTPS
2. **限制 CORS**: 在 `main.ts` 中配置具体的允许来源，而不是 `origin: true`
3. **添加限流**: 使用 `@nestjs/throttler` 添加请求限流
4. **API Key 保护**: 永远不要将 `.env` 文件提交到 Git
5. **日志管理**: 定期清理日志文件，防止磁盘占满

## 故障排查

### 服务无法启动

- 检查端口是否被占用：`lsof -i :3000`
- 检查环境变量是否正确配置
- 查看日志：`docker-compose logs` 或 `pm2 logs`

### API 调用失败

- 确认 API Key 有效且有足够额度
- 检查网络连接到 DashScope API
- 查看后端日志获取详细错误信息

### 快应用无法连接

- 确认后端服务正在运行
- 检查 VPS 防火墙是否开放端口
- 确认快应用配置中的 `backend.url` 正确

## 技术栈

- **框架**: Nest.js 11.x
- **语言**: TypeScript 5.x
- **AI SDK**: OpenAI SDK 6.x (用于调用 DashScope OpenAI 兼容接口)
- **容器**: Docker & Docker Compose
- **进程管理**: PM2 (可选)

## License

MIT
