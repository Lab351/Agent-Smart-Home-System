export type DashboardTone = 'accent' | 'success' | 'warning' | 'neutral';

export type DashboardStat = {
  label: string;
  value: string;
  detail: string;
  tone: DashboardTone;
};

export type DashboardAction = {
  title: string;
  detail: string;
  badge: string;
};

export type DashboardFocus = {
  title: string;
  detail: string;
  severity: 'high' | 'medium';
};

export type DashboardCheckpoint = {
  label: string;
  status: 'done' | 'active' | 'pending' | 'blocked';
  detail: string;
};

export type DashboardModel = {
  heroTitle: string;
  heroSummary: string;
  syncStatus: string;
  stats: DashboardStat[];
  actions: DashboardAction[];
  reviewFocus: DashboardFocus[];
  todayPlan: DashboardCheckpoint[];
  testStatus: DashboardCheckpoint[];
};

type DashboardInput = {
  backendUrl: string;
  mqttHost: string;
  mqttWsPort: number;
  roomCount: number;
  platform: string;
};

function toEndpointLabel(backendUrl: string): string {
  try {
    const url = new URL(backendUrl);
    return url.host;
  } catch {
    return backendUrl.replace(/^https?:\/\//, '');
  }
}

export function buildDashboardModel(input: DashboardInput): DashboardModel {
  const backendLabel = toEndpointLabel(input.backendUrl);
  const mqttLabel = `${input.mqttHost}:${input.mqttWsPort}`;

  return {
    heroTitle: 'Personal Agent',
    heroSummary:
      '围绕房间绑定、语音入口与设备控制链路，先把 React Native 端的最小业务闭环搭出来。',
    syncStatus: '线上 main 同步受限：当前环境无法连接 GitHub 代理，评估基于本地分支。',
    stats: [
      {
        label: '后端发现服务',
        value: backendLabel,
        detail: 'Beacon 到 room-agent 的映射仍需在 RN 端接入。',
        tone: 'accent',
      },
      {
        label: 'MQTT 通道',
        value: mqttLabel,
        detail: '控制 transport 仍待从快应用迁移到 React Native。',
        tone: 'warning',
      },
      {
        label: '房间映射',
        value: `${input.roomCount} 个房间`,
        detail: 'Beacon major 到 roomId 的本地映射已存在。',
        tone: 'success',
      },
      {
        label: '运行平台',
        value: input.platform,
        detail: '优先保证 Android 真机链路，Web 用于页面迭代和视觉验证。',
        tone: 'neutral',
      },
    ],
    actions: [
      {
        title: '语音控制入口',
        detail: '已具备录音服务封装，下一步接 ASR 与 intent 解析。',
        badge: '进行中',
      },
      {
        title: '房间绑定状态',
        detail: 'BLE 扫描基础已到位，需要页面态和订阅回路。',
        badge: '优先级高',
      },
      {
        title: '偏好与习惯',
        detail: '领域模型已定义，还缺持久化流程与编辑界面。',
        badge: '待接入',
      },
    ],
    reviewFocus: [
      {
        title: '录音实现仍有 SDK 内部路径耦合风险',
        detail: '必须只依赖 expo-audio 公共导出，避免小版本升级直接失效。',
        severity: 'high',
      },
      {
        title: 'React Native 端没有业务化首页',
        detail: '默认示例页无法承载联调状态、权限提示和开发优先级。',
        severity: 'high',
      },
      {
        title: '自动化测试基线缺失',
        detail: '当前没有 Jest 配置，功能回归主要靠人工和真机联调。',
        severity: 'high',
      },
      {
        title: '发现与控制服务尚未迁移',
        detail: '旧版 quickapp 的 Discovery/Control 能力还没有进入 RN 闭环。',
        severity: 'medium',
      },
    ],
    todayPlan: [
      {
        label: '重做控制台首页',
        status: 'active',
        detail: '用业务信息替换 Expo 默认模板，直接暴露开发进度和关键状态。',
      },
      {
        label: '补齐 Jest 测试基线',
        status: 'active',
        detail: '先覆盖纯逻辑与平台服务关键路径，再补组件层回归。',
      },
      {
        label: '抽象发现与控制服务',
        status: 'pending',
        detail: '对齐 quickapp 版 DiscoveryService / ControlService 能力边界。',
      },
      {
        label: '验证真机扫描与录音链路',
        status: 'blocked',
        detail: '需要 Expo dev build 或原生运行环境，本机命令无法替代。',
      },
    ],
    testStatus: [
      {
        label: 'TypeScript 类型检查',
        status: 'done',
        detail: '已作为本轮改动的静态校验执行通过。',
      },
      {
        label: 'Jest 单元测试',
        status: 'blocked',
        detail: '测试文件已补齐，但当前环境无法解析 npm 镜像域名，尚未完成依赖安装。',
      },
      {
        label: '原生集成测试',
        status: 'blocked',
        detail: 'BLE 与录音依赖真机/模拟器权限与原生模块，不适合在当前 CLI 环境完成。',
      },
    ],
  };
}
