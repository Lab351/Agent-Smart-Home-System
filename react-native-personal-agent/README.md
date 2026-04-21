# React Native Personal Agent

`react-native-personal-agent` 是当前快应用版 `personal-agent/` 的移动端迁移骨架。它基于 Expo Router + TypeScript，优先服务手机 iOS/Android，并把 BLE、录音、房间绑定、语音入口、偏好管理这些核心能力先迁成 React Native 可持续演进的结构。

## 当前能力

- Expo Router 原生 tabs：`首页 / 语音 / 房间 / 偏好`
- Expo Dev Build 工作流，适配 `react-native-ble-plx`
- `expo-audio` 录音服务封装
- BLE Beacon 扫描、ESP32 厂商数据解析与房间绑定协调器
- 用户偏好与习惯本地存储
- Discovery / Intent / Control / Home-Agent 服务骨架
- Jest 单测基线，覆盖解析器、录音服务、BLE 服务、意图服务、发现服务、偏好服务

## 环境要求

- Node.js `>= 20.19.4`
- Xcode / Android Studio 按 Expo Dev Build 标准安装
- 由于使用 `react-native-ble-plx`，不能只靠 Expo Go

## 开发命令

```bash
npm install
npm run typecheck
npm run lint
npm run test:ci
npm run prebuild
npm run android
npm run ios
npm run start
```

说明：

- `npm run start` 以 Dev Client 模式启动 Metro
- `npm run android` / `npm run ios` 会生成并运行原生开发版本
- BLE 与录音功能需要真机或具备原生能力的模拟器验证

## 配置

项目通过 Expo app config 和 `EXPO_PUBLIC_*` 变量读取运行参数。默认字段见 [`.env.example`](/Users/weishuokun/mycode/SCUT_thesis/Agent-Smart-Home-System/react-native-personal-agent/.env.example)。

关键配置：

- `EXPO_PUBLIC_USER_ID`
- `EXPO_PUBLIC_BACKEND_URL`
- `EXPO_PUBLIC_BEACON_UUID`

## 目录说明

- `src/app/`: Expo Router 路由入口
- `src/features/`: 页面和业务 UI
- `src/platform/`: React Native / Expo 平台适配层
- `src/services/`: 业务服务、协调器、控制传输
- `src/store/`: 应用状态与页面接线
- `src/types/`: 共享领域类型与接口

## 迁移边界

这个项目目前是“可运行的迁移骨架”，不是快应用功能等价替代。已完成的是结构和关键原生能力接入，尚未完成的包括：

- ASR 上传和后端识别闭环
- Room-Agent / Home-Agent 真实执行结果回流
- 偏好编辑表单与完整交互
- 真机上的 BLE 背景扫描策略
