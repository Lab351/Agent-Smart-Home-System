# 语音识别（ASR）快速上手指南

## 第一步：后端配置

### 1. 获取阿里云 API 密钥

1. 访问 [阿里云 RAM 控制台](https://ram.console.aliyun.com/manage/ak)
   - 创建或查看 AccessKey ID 和 AccessKey Secret

2. 访问 [智能语音交互控制台](https://nls-portal.console.aliyun.com/)
   - 开启"录音文件识别"或"实时语音识别"服务
   - 获取 AppKey

### 2. 配置环境变量

在 `qwen-backend` 目录下创建 `.env` 文件：

```bash
cd ~/mycode/agent-home-system/qwen-backend
cp .env.example .env
```

编辑 `.env` 文件，添加以下内容：

```bash
# 阿里云语音识别配置（二选一）

# 方式1：使用智能语音交互（传统）
ALIBABA_APP_KEY=你的AppKey
ALIBABA_ACCESS_KEY_ID=你的AccessKeyID
ALIBABA_ACCESS_KEY_SECRET=你的AccessKeySecret
ALIBABA_ASR_ENDPOINT=https://nls-meta.cn-shanghai.aliyuncs.com

# 方式2：使用 DashScope（推荐，与 Qwen 复用）
DASHSCOPE_API_KEY=sk-你的API密钥
```

### 3. 安装依赖并启动

```bash
cd ~/mycode/agent-home-system/qwen-backend
npm install
npm run start:dev
```

后端服务将在 `http://120.78.228.69:3088` 启动

## 第二步：前端使用

### 1. 验证后端配置

在浏览器或终端测试后端 API：

```bash
curl http://120.78.228.69:3088/asr
```

如果返回 405（Method Not Allowed），说明服务正常运行。

### 2. 打包并安装快应用

```bash
cd ~/mycode/agent-home-system/watch-agent
npm run build
```

生成的 `.rpk` 文件位于 `dist/` 目录

### 3. 使用语音识别

在快应用的"语音控制"页面：

1. 点击麦克风按钮 🎤
2. 说话（如："打开客厅灯"）
3. 录音完成后自动识别
4. 页面显示识别结果

## 功能特点

### 自动习惯提取

当识别到包含关键词的文本时，会自动保存为用户习惯：

- **关键词**：喜欢、习惯、每天、经常、总是
- **自动分类**：
  - 灯光相关 → lighting
  - 空调相关 → climate
  - 音乐相关 → entertainment
  - 其他 → general

### 支持的音频格式

- AAC（推荐）
- MP3
- WAV
- PCM

### 采样率

- 推荐：16000 Hz
- 支持：8000 Hz, 16000 Hz, 44100 Hz

## 常见问题

### Q1: 识别失败怎么办？

**检查清单：**
- [ ] 后端服务是否启动
- [ ] 阿里云 API 密钥是否正确
- [ ] 网络连接是否正常
- [ ] 音频文件格式是否支持

**调试方法：**

```bash
# 查看后端日志
cd ~/mycode/agent-home-system/qwen-backend
npm run start:dev
```

### Q2: 如何切换到 DashScope？

在 `.env` 文件中配置：

```bash
DASHSCOPE_API_KEY=sk-你的API密钥
```

然后重启后端服务即可。

### Q3: 快应用无法读取录音文件？

检查以下设置：

1. 录音配置中的 `sampleRate` 是否正确（推荐 16000）
2. 录音返回的 `uri` 是否存在
3. 快应用权限是否开启

### Q4: 如何手动调用 ASR？

```javascript
import AsrService from '../../services/AsrService'

const asrService = new AsrService()

// 识别录音文件
const text = await asrService.recognize(
  audioUri,    // 录音文件 URI
  'aac',       // 格式
  16000       // 采样率
)

console.log('识别结果:', text)
```

## 费用说明

阿里云语音识别：

- 录音文件识别：约 2-5 元/万次
- 实时语音识别：约 2-5 元/小时

DashScope 语音识别（推荐）：

- Paraformer 模型：约 0.5-2 元/小时
- 准确率更高，支持更多方言

## 下一步

- [ ] 集成语音合成（TTS）
- [ ] 实现实时语音识别（WebSocket）
- [ ] 添加语音唤醒词功能
- [ ] 完善意图识别和自动执行

## 参考文档

- [ASR 集成详细文档](./ASR_INTEGRATION.md)
- [阿里云语音识别文档](https://help.aliyun.com/document_detail/84428.html)
- [DashScope API 文档](https://help.aliyun.com/document_detail/2712195.html)
