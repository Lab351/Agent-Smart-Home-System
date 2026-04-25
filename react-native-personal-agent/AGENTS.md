# React Native Personal Agent 智能体协作指南

这份文件是智能体进入 `react-native-personal-agent/` 的短入口。它不是完整项目手册；
完整背景以 `README.md`、源码和测试为准。修改前先建立地图，修改后把可复用的经验沉淀回
仓库，而不是只留在一次对话里。

## 项目定位

- 本项目是 `personal-agent/` 的移动端迁移骨架，基于 Expo Router、React Native、
  TypeScript 和 Expo Dev Build。
- 目标平台优先是 iOS / Android 真机；因为使用 `react-native-ble-plx`，不要假设 Expo Go
  能覆盖 BLE、录音和原生权限验证。
- 当前核心链路包括：房间 BLE 绑定、录音/ASR 入口、意图解析、Discovery、A2A 控制传输、
  Room-Agent / Home-Agent 调用、偏好与执行历史本地状态。

## 阅读地图

开始改动前，按任务范围优先读取这些位置：

- `README.md`：当前能力、环境要求、运行命令和迁移边界。
- `package.json`：脚本、Expo / React Native / Jest / TypeScript 版本。
- `app.config.ts`：原生权限、Dev Client、BLE、音频、环境变量和 Expo 配置。
- `src/types/`：领域契约、平台接口、传输接口；跨层字段先从这里确认。
- `src/store/app-state.tsx`：页面状态、服务实例化、主业务编排入口。
- `src/__tests__/`：已有行为约束；新增服务或边界逻辑时优先补测试。

## 目录边界

- `src/app/` 只放 Expo Router 路由入口和页面挂载，不堆业务逻辑。
- `src/features/` 放页面 UI、展示模型、轻量交互逻辑和 feature 内 helper。
- `src/services/` 放业务服务、编排器、控制链路、Discovery、ASR、偏好和历史。
- `src/services/transports/` 放 A2A / HTTP 等传输适配，不把协议细节散到 UI。
- `src/platform/` 放 Expo / React Native / 原生能力适配，如 BLE、音频、存储、网络。
- `src/store/` 负责把服务接到 React 状态和页面事件；避免成为无法测试的业务黑箱。
- `src/types/` 是跨层契约源头；新增跨模块字段时先定义或更新类型。
- `src/constants/`、`src/config/` 放主题和运行配置，不在组件里硬编码环境差异。

## 工作方式

- 先用 `rg`、现有类型和测试定位事实，再修改代码；不要靠文件名猜测调用链。
- 优先沿用现有服务、类型、状态和测试风格；只有能减少真实复杂度时才新增抽象。
- 每次改动都尽量让智能体下一次更容易接手：修正过时注释、补测试名、更新 README 或本文件。
- 不把隐性约定只写在对话里；若它会影响后续开发，应落到源码、测试或文档。
- 保护用户已有改动。遇到无关脏文件时忽略；遇到相关改动时先读懂并在其基础上继续。
- 文档要短而可执行。这里写方向、边界和命令；细节让代码、类型和测试承担。

## React Native / Expo 约束

- BLE、录音、深链和权限相关改动要考虑 Dev Build 与真机验证；必要时说明模拟器无法覆盖的风险。
- 图片优先使用 `expo-image`；交互控件优先使用 `Pressable`，不要新增 `TouchableOpacity` 风格代码。
- 长列表要考虑虚拟化、稳定 callback、稳定 item 组件和避免 render 内联对象。
- 动画优先只驱动 `transform` 和 `opacity`，复杂手势/动画遵循 Reanimated 与 gesture-handler 约束。
- ScrollView / 页面容器要处理 safe area、content inset 和键盘遮挡，不让内容贴边或被系统 UI 覆盖。
- React Compiler 已开启；组件中注意稳定引用、避免不必要订阅和宽泛状态提升。
- 平台能力隔离在 `src/platform/`；UI 和 feature 不直接调用 BLE manager、AsyncStorage 或裸网络实现。

## 质量不变量

- 边界数据必须解析或校验：后端响应、A2A payload、BLE manufacturer data、深链 query、存储内容都不能盲信。
- 服务层应能在 Jest 中隔离测试；新增外部依赖时提供可替换的 adapter 或传入式依赖。
- 控制链路失败要返回用户可理解的状态和 detail，不吞掉异常，也不只打 `console.warn`。
- UI 展示状态应来自明确的 domain result，不在组件里重复推断 task state、room route 或错误类型。
- 本地状态、执行历史、偏好和中断任务恢复要保持向后兼容；调整结构时补迁移或容错读取。
- 新增环境变量必须经过 `src/config/env.ts` 统一读取，并同步 `.env.example` 与 README。

## 验证命令

在 `react-native-personal-agent/` 目录下按改动风险选择：

```bash
npm run typecheck
npm run typecheck:tests
npm run lint
npm run test:ci
```

- 只改文档时不必运行应用测试，但要确认路径、命令和说明仍与仓库一致。
- 改 TypeScript 业务逻辑时至少运行相关 Jest 测试和 `npm run typecheck`。
- 改测试类型、mock 或 test helper 时运行 `npm run typecheck:tests`。
- 改 Expo config、权限、BLE、音频或 native module 时，补充 `npm run prebuild` 或真机验证说明。
- 如果依赖缺失，先使用项目本地 `node_modules` 和 `npm install`；不要假设仓库根目录能替代子项目环境。

## 熵控制

- 看到重复 parser、presentation helper、mock factory 或状态映射时，优先收敛到共享函数和测试。
- 发现 README、`.env.example`、测试名或本文件与现实不一致时，顺手修正相关最小范围。
- 临时绕法必须有去留判断：能删就删，必须保留就写明触发条件和验证方式。
- 新能力先追求可观测、可测试、可回退，再追求覆盖所有产品细节。
