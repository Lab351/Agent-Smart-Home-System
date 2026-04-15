import {
  buildBeaconScanIssue,
  buildRoomBindingScanStatus,
  formatBeaconDiagnosticPreview,
} from '@/features/room-binding/scan-feedback';

describe('room-binding scan feedback helpers', () => {
  it('maps permission and emulator failures into actionable UI copy', () => {
    expect(
      buildBeaconScanIssue({
        error: new Error('Bluetooth permissions are not granted'),
        permission: {
          granted: false,
          canAskAgain: true,
          status: 'denied',
        },
        updatedAt: 1,
      })
    ).toEqual({
      code: 'permission-denied',
      summary: '蓝牙权限未授权，无法开始扫描。',
      detail: '请在系统设置中允许附近设备与蓝牙权限，然后重新开始扫描。',
      updatedAt: 1,
    });

    expect(
      buildBeaconScanIssue({
        error: new Error(
          'BLE is not available on Android Emulator. Please use a physical device for Bluetooth functionality.'
        ),
        permission: {
          granted: true,
          canAskAgain: false,
          status: 'granted',
        },
        updatedAt: 2,
      })
    ).toEqual({
      code: 'emulator-unsupported',
      summary: '当前运行环境不支持 BLE 扫描。',
      detail: 'Android 模拟器无法提供稳定的蓝牙能力，请改用真机和 Expo Dev Build 联调。',
      updatedAt: 2,
    });
  });

  it('builds scan status text for active, idle, and failed states', () => {
    expect(
      buildRoomBindingScanStatus({
        currentRoomName: '客厅',
        discoveredBeaconCount: 2,
        isScanning: true,
        isStarting: false,
        issue: null,
      })
    ).toBe('当前绑定客厅，已识别 2 个符合协议的 Beacon。');

    expect(
      buildRoomBindingScanStatus({
        currentRoomName: null,
        discoveredBeaconCount: 0,
        isScanning: false,
        isStarting: false,
        issue: {
          code: 'bluetooth-powered-off',
          summary: '蓝牙尚未开启，扫描没有启动。',
          detail: '请先打开系统蓝牙开关，再重新开始扫描。',
          updatedAt: 3,
        },
      })
    ).toBe('蓝牙尚未开启，扫描没有启动。');

    expect(
      buildRoomBindingScanStatus({
        currentRoomName: '书房',
        discoveredBeaconCount: 0,
        isScanning: false,
        isStarting: false,
        issue: null,
      })
    ).toBe('当前保留绑定房间：书房。');
  });

  it('formats beacon diagnostics with device context for the UI list', () => {
    expect(
      formatBeaconDiagnosticPreview({
        deviceId: 'beacon-1',
        localName: 'ESP32 Study',
        reason: 'unmapped-major',
        summary: '识别到自定义 Beacon，但 major 未命中房间映射。',
        detail: 'Beacon major=7，当前 app 仅映射 1, 2, 3, 4。',
        rssi: -61,
        major: 7,
        manufacturerDataPreview: 'FF FF 01 00 07 00',
        updatedAt: 4,
      })
    ).toEqual({
      key: 'beacon-1:unmapped-major:7:4',
      summary: '识别到自定义 Beacon，但 major 未命中房间映射。',
      detail:
        'Beacon major=7，当前 app 仅映射 1, 2, 3, 4。 设备 ESP32 Study · major 7 · RSSI -61 dBm · payload FF FF 01 00 07 00',
    });
  });
});
