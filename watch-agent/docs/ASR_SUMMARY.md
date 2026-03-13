# ASR 集成总结

## 已完成的工作

### 后端（qwen-backend）

#### 1. 新增文件

- **`src/asr/asr.module.ts`** - ASR 模块定义
- **`src/asr/asr.controller.ts`** - 控制器（提供 `/asr` 和 `/asr/base64` 接口）
- **`src/asr/asr.service.ts`** - 业务逻辑（调用阿里云 API）
- **`src/asr/dto/asr.dto.ts`** - 数据传输对象

#### 2. 修改文件

- **`src/app.module.ts`** - 注册 AsrModule
- **`package.json`** - 添加依赖：`multer`、`axios`、`form-data`
- **`.env.example`** - 添加阿里云配置项

#### 3. 接口说明

- **POST /asr** - 上传音频文件（multipart）
- **POST /asr/base64** - Base64 编码音频（快应用推荐）

### 前端（watch-agent）

#### 1. 新增文件

- **`src/services/AsrService.js`** - ASR 服务封装

#### 2. 修改文件

- **`src/pages/VoiceControl/index.ux`** - 集成 ASR 功能
  - 添加 `asrService` 初始化
  - 修改录音采样率为 16000
  - 录音完成后自动调用 ASR
  - 添加习惯提取和命令处理

- **`README.md`** - 添加 ASR 功能说明

#### 3. 新增文档

- **`docs/ASR_INTEGRATION.md`** - 详细集成文档
- **`docs/ASR_QUICKSTART.md`** - 快速上手指南

## 使用流程

```
用户点击麦克风
    ↓
开始录音（16kHz, AAC）
    ↓
录音完成（返回 URI）
    ↓
AsrService 读取文件
    ↓
转换为 Base64
    ↓
上传到后端 /asr/base64
    ↓
后端调用阿里云 ASR
    ↓
返回识别文本
    ↓
显示在页面上
    ↓
自动提取用户习惯（如果包含关键词）
```

## 配置要点

### 后端环境变量

```bash
# 阿里云配置（二选一）
ALIBABA_APP_KEY=xxx
ALIBABA_ACCESS_KEY_ID=xxx
ALIBABA_ACCESS_KEY_SECRET=xxx

# 或使用 DashScope（推荐）
DASHSCOPE_API_KEY=sk-xxx
```

### 前端配置

无需额外配置，自动使用 `config.backend.url`

## 功能特性

✅ 录音后自动识别
✅ 支持多种音频格式（AAC/MP3/WAV/PCM）
✅ 自动提取用户习惯
✅ 错误处理和日志记录
✅ Base64 编码传输（兼容性好）

## 下一步优化

1. **实时语音识别** - 使用 WebSocket 实现流式识别
2. **语音合成（TTS）** - 添加文本转语音功能
3. **唤醒词** - 支持语音唤醒
4. **离线识别** - 集成轻量级离线模型
5. **降噪处理** - 提升录音质量

## 测试建议

### 1. 后端测试

```bash
# 安装依赖
cd ~/mycode/agent-home-system/qwen-backend
npm install

# 启动服务
npm run start:dev

# 测试接口
curl -X POST http://localhost:3000/asr/base64 \
  -H "Content-Type: application/json" \
  -d '{"audio":"data:audio/aac;base64,...","format":"aac","sampleRate":16000}'
```

### 2. 前端测试

1. 打包快应用
2. 安装到手机/手表
3. 打开语音控制页面
4. 点击麦克风，说话
5. 查看识别结果

## 注意事项

1. **阿里云 API 限制** - 注意调用次数和费用
2. **网络要求** - ASR 需要稳定的网络连接
3. **音频质量** - 采样率建议 16000，不要太低
4. **隐私考虑** - 音频会上传到云端，需注意用户隐私

## 故障排查

### 问题：后端启动失败

检查依赖是否完整：
```bash
cd ~/mycode/agent-home-system/qwen-backend
npm install
```

### 问题：识别失败

检查：
- 阿里云配置是否正确
- 网络是否通畅
- 音频文件格式是否支持

### 问题：快应用无法读取文件

检查：
- 录音 URI 是否正确
- 文件权限
- 快应用版本

## 参考资源

- [阿里云语音识别文档](https://help.aliyun.com/document_detail/84428.html)
- [DashScope API 文档](https://help.aliyun.com/document_detail/2712195.html)
- [快应用录音文档](https://doc.quickapp.cn/features/system_record.html)
