import type { BeaconScanDiagnostic, BeaconScanIssue, PermissionSnapshot } from '@/types';

export function buildBeaconScanIssue(options: {
  error: unknown;
  permission: PermissionSnapshot | null;
  updatedAt?: number;
}): BeaconScanIssue {
  const message = options.error instanceof Error ? options.error.message : String(options.error ?? '');
  const normalizedMessage = message.toLowerCase();
  const updatedAt = options.updatedAt ?? Date.now();

  if (options.permission && !options.permission.granted) {
    return {
      code: 'permission-denied',
      summary: '蓝牙权限未授权，无法开始扫描。',
      detail: '请在系统设置中允许附近设备与蓝牙权限，然后重新开始扫描。',
      updatedAt,
    };
  }

  if (normalizedMessage.includes('android emulator') || normalizedMessage.includes('physical device')) {
    return {
      code: 'emulator-unsupported',
      summary: '当前运行环境不支持 BLE 扫描。',
      detail: 'Android 模拟器无法提供稳定的蓝牙能力，请改用真机和 Expo Dev Build 联调。',
      updatedAt,
    };
  }

  if (normalizedMessage.includes('powered on')) {
    return {
      code: 'bluetooth-powered-off',
      summary: '蓝牙尚未开启，扫描没有启动。',
      detail: '请先打开系统蓝牙开关，再重新开始扫描。',
      updatedAt,
    };
  }

  if (normalizedMessage.includes('blemanager')) {
    return {
      code: 'bluetooth-unavailable',
      summary: '蓝牙模块初始化失败。',
      detail: '请确认设备支持 BLE，且当前 Dev Build 已正确集成原生蓝牙能力。',
      updatedAt,
    };
  }

  return {
    code: 'unknown',
    summary: 'BLE 扫描启动失败。',
    detail: message || '请检查蓝牙权限、系统蓝牙状态和当前设备环境。',
    updatedAt,
  };
}

export function buildRoomBindingScanStatus(options: {
  currentRoomName: string | null;
  discoveredBeaconCount: number;
  isScanning: boolean;
  isStarting: boolean;
  issue: BeaconScanIssue | null;
}): string {
  if (options.isStarting) {
    return '正在启动 BLE 扫描...';
  }

  if (options.issue) {
    return options.issue.summary;
  }

  if (options.isScanning) {
    if (options.currentRoomName && options.discoveredBeaconCount > 0) {
      return `当前绑定${options.currentRoomName}，已识别 ${options.discoveredBeaconCount} 个符合协议的 Beacon。`;
    }

    if (options.currentRoomName) {
      return `当前绑定${options.currentRoomName}，等待新的 Beacon 广播。`;
    }

    return options.discoveredBeaconCount > 0
      ? `已识别 ${options.discoveredBeaconCount} 个符合协议的 Beacon。`
      : '已启动扫描，尚未识别到符合协议的 Beacon。';
  }

  if (options.currentRoomName) {
    return `当前保留绑定房间：${options.currentRoomName}。`;
  }

  return '尚未开始扫描。';
}

export function formatBeaconDiagnosticPreview(diagnostic: BeaconScanDiagnostic): {
  key: string;
  summary: string;
  detail: string;
} {
  const key = [
    diagnostic.deviceId ?? 'unknown-device',
    diagnostic.reason,
    diagnostic.major ?? 'no-major',
    diagnostic.updatedAt,
  ].join(':');
  const contextParts = [
    diagnostic.localName ? `设备 ${diagnostic.localName}` : null,
    diagnostic.major !== null ? `major ${diagnostic.major}` : null,
    diagnostic.rssi !== null ? `RSSI ${diagnostic.rssi} dBm` : null,
    diagnostic.manufacturerDataPreview
      ? `payload ${diagnostic.manufacturerDataPreview}`
      : null,
  ].filter(Boolean);

  if (!contextParts.length) {
    return {
      key,
      summary: diagnostic.summary,
      detail: diagnostic.detail,
    };
  }

  return {
    key,
    summary: diagnostic.summary,
    detail: `${diagnostic.detail} ${contextParts.join(' · ')}`,
  };
}
