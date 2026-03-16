# 语音识别（ASR）集成文档

## 概述

watch-agent 现已集成阿里云语音识别功能，支持录音后自动识别为文本。

## 架构

```
watch-agent (快应用前端)
    ↓ 录音文件
    ↓ Base64 编码
qwen-backend (NestJS 后端)
    ↓ 上传到阿里云
阿里云语音识别服务
    ↓ 返回识别文本
watch-agent (显示结果)
```

## 后端配置

### 1. 安装依赖

```bash
cd ~/mycode/agent-home-system/qwen-backend
npm install
```

### 2. 环境变量配置

在 `.env` 文件中添加阿里云配置：

```bash
# 阿里云语音识别配置
ALIBABA_APP_KEY=你的AppKey
ALIBABA_ACCESS_KEY_ID=你的AccessKeyID
ALIBABA_ACCESS_KEY_SECRET=你的AccessKeySecret
ALIBABA_ASR_ENDPOINT=https://nls-meta.cn-shanghai.aliyuncs.com

# 或使用 DashScope（推荐）
DASHSCOPE_API_KEY=你的DashScope-API-Key
```

### 3. 获取阿里云 API 密钥

1. 访问 [阿里云控制台](https://ram.console.aliyun.com/manage/ak)
2. 创建 AccessKey（AccessKey ID 和 AccessKey Secret）
3. 访问 [智能语音交互控制台](https://nls-portal.console.aliyun.com/)
4. 开启"录音文件识别"服务
5. 获取 AppKey

### 4. 启动后端服务

```bash
npm run start:dev
```

服务将在 `http://120.78.228.69:3088` 启动

## 前端使用

### 自动语音识别

在语音控制页面：

1. 点击麦克风按钮开始录音
2. 录音完成后自动调用 ASR 服务
3. 显示识别结果
4. 自动提取用户习惯并保存

### 手动调用

```javascript
import AsrService from '../../services/AsrService'

const asrService = new AsrService()

const text = await asrService.recognize(
  audioUri,        // 录音文件 URI
  'aac',           // 格式
  16000           // 采样率
)

console.log('识别结果:', text)
```

## API 接口

### POST /asr

上传音频文件进行识别（multipart）

**请求：**
```bash
curl -X POST http://localhost:3088/asr \
  -F "file=@audio.aac" \
  -F "format=aac" \
  -F "sampleRate=16000"
```

**响应：**
```json
{
  "success": true,
  "data": {
    "text": "打开客厅灯",
    "confidence": 0.95
  }
}
```

### POST /asr/base64

Base64 编码的音频识别（快应用推荐）

**请求：**
```json
{
  "audio": "data:audio/aac;base64,...",
  "format": "aac",
  "sampleRate": 16000
}
```

**响应：**
```json
{
  "success": true,
  "data": {
    "text": "打开客厅灯",
    "confidence": 0.95
  }
}
```

## 文件说明

### 后端文件

- `src/asr/asr.module.ts` - ASR 模块
- `src/asr/asr.controller.ts` - 控制器
- `src/asr/asr.service.ts` - 业务逻辑（阿里云 API 调用）
- `src/asr/dto/asr.dto.ts` - 数据传输对象

### 前端文件

- `src/services/AsrService.js` - ASR 服务封装
- `src/pages/VoiceControl/index.ux` - 集成 ASR 的语音控制页面

## 支持的音频格式

- AAC（推荐）
- MP3
- WAV
- PCM

建议使用 AAC 格式，文件小且兼容性好。

## 采样率

- 推荐：16000 Hz
- 支持：8000 Hz, 16000 Hz, 44100 Hz

## 费用参考

阿里云语音识别：

- 录音文件识别：~2-5 元/万次
- 实时语音识别：~2-5 元/小时

DashScope 语音识别（推荐）：

- Paraformer 模型：~0.5-2 元/小时
- 准确率更高

## 故障排查

### 1. 识别失败

检查：
- 后端是否启动
- 阿里云配置是否正确
- 网络连接是否正常

### 2. 音频文件读取失败

检查：
- 录音文件路径是否正确
- 文件格式是否支持
- 快应用权限是否开启

### 3. 后端 API 404

检查：
- 后端是否启动
- `/asr` 路由是否注册
- 端口是否正确

## 后续扩展

- [ ] 实时语音识别（WebSocket）
- [ ] 支持语音唤醒词
- [ ] 添加语音合成（TTS）
- [ ] 语义理解和意图识别
- [ ] 多语言支持

## 相关资源

- [阿里云语音识别文档](https://help.aliyun.com/document_detail/84428.html)
- [DashScope API 文档](https://help.aliyun.com/document_detail/2712195.html)
- [快应用录音文档](https://doc.quickapp.cn/features/system_record.html)
