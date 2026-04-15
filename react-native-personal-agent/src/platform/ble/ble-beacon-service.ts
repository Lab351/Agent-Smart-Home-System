import { BleManager, type Device } from 'react-native-ble-plx';
import { PermissionsAndroid, Platform } from 'react-native';
import * as ExpoDevice from 'expo-device';

import { appEnv, getRoomDisplayName, getRoomIdFromBeaconMajor } from '@/config/env';
import {
  parseEsp32BeaconManufacturerData,
  rssiToDistance,
} from '@/platform/ble/esp32-beacon-parser';
import type {
  BeaconScanDiagnostic,
  BeaconScanResult,
  BeaconScanStopReason,
  IBleBeaconService,
  PermissionSnapshot,
  RoomBinding,
} from '@/types';

const RSSI_THRESHOLD = -70;
const RSSI_HYSTERESIS = 5;
type AndroidPermission =
  (typeof PermissionsAndroid.PERMISSIONS)[keyof typeof PermissionsAndroid.PERMISSIONS];

export class BleBeaconService implements IBleBeaconService {
  private manager: BleManager | null = null;
  private managerInitError: Error | null = null;
  private readonly scanListeners = new Set<(result: BeaconScanResult) => void>();
  private readonly diagnosticListeners = new Set<(diagnostic: BeaconScanDiagnostic) => void>();
  private readonly roomBindingListeners = new Set<(binding: RoomBinding | null) => void>();
  private scanning = false;
  private scanStartPromise: Promise<void> | null = null;
  private scanSessionId = 0;
  private activeScanSessionId: number | null = null;
  private lastRssi = RSSI_THRESHOLD;
  private currentRoomBinding: RoomBinding | null = null;

  async getPermissionStatus(): Promise<PermissionSnapshot> {
    if (Platform.OS !== 'android') {
      return {
        granted: true,
        canAskAgain: true,
        status: 'granted',
      };
    }

    const permissions = this.getAndroidPermissions();
    const checks = await Promise.all(permissions.map(permission => PermissionsAndroid.check(permission)));
    const granted = checks.every(Boolean);

    return {
      granted,
      canAskAgain: true,
      status: granted ? 'granted' : 'undetermined',
    };
  }

  async requestPermissions(): Promise<PermissionSnapshot> {
    if (Platform.OS !== 'android') {
      return {
        granted: true,
        canAskAgain: true,
        status: 'granted',
      };
    }

    const permissions = this.getAndroidPermissions();
    const result = await PermissionsAndroid.requestMultiple(permissions);
    const permissionResults = result as Record<string, string>;
    const granted = permissions.every(
      permission => permissionResults[permission] === PermissionsAndroid.RESULTS.GRANTED
    );

    return {
      granted,
      canAskAgain: true,
      status: granted ? 'granted' : 'denied',
    };
  }

  async startScanning(): Promise<void> {
    const requestedSessionId = this.scanSessionId + 1;
    console.debug('[BleBeaconService] Start scanning requested', {
      requestedSessionId,
      scanning: this.scanning,
      hasPendingStart: Boolean(this.scanStartPromise),
    });

    if (this.scanning) {
      console.debug('[BleBeaconService] Start scanning ignored because scan is already active', {
        requestedSessionId,
        activeScanSessionId: this.activeScanSessionId,
      });
      return;
    }

    if (this.scanStartPromise) {
      console.debug('[BleBeaconService] Start scanning is waiting for the in-flight start request', {
        requestedSessionId,
      });
      await this.scanStartPromise;
      return;
    }

    this.scanSessionId = requestedSessionId;

    const startPromise = (async () => {
      const manager = this.getManager();
      const currentPermission = await this.getPermissionStatus();
      const permission = currentPermission.granted
        ? currentPermission
        : await this.requestPermissions();

      if (!permission.granted) {
        throw new Error('Bluetooth permissions are not granted');
      }

      await this.waitUntilPoweredOn(manager);

      manager.startDeviceScan(null, { allowDuplicates: true }, (error, device) => {
        if (error) {
          console.warn('[BleBeaconService] Scan error', error);
          return;
        }

        if (!device) {
          return;
        }

        this.handleScannedDevice(device);
      });

      this.scanning = true;
      this.activeScanSessionId = requestedSessionId;
      console.debug('[BleBeaconService] Beacon scanning started', {
        sessionId: requestedSessionId,
        permissionStatus: permission.status,
      });
    })();

    this.scanStartPromise = startPromise;

    try {
      await startPromise;
    } finally {
      if (this.scanStartPromise === startPromise) {
        this.scanStartPromise = null;
      }
    }
  }

  async stopScanning(reason: BeaconScanStopReason = 'unspecified'): Promise<void> {
    console.debug('[BleBeaconService] Stop scanning requested', {
      reason,
      scanning: this.scanning,
      hasPendingStart: Boolean(this.scanStartPromise),
      activeScanSessionId: this.activeScanSessionId,
    });

    if (this.scanStartPromise) {
      try {
        await this.scanStartPromise;
      } catch {
        // Ignore start failures during stop.
      }
    }

    const manager = this.manager;
    if (!this.scanning || !manager) {
      console.debug('[BleBeaconService] Stop scanning skipped because no active scan exists', {
        reason,
        scanning: this.scanning,
        hasManager: Boolean(manager),
        activeScanSessionId: this.activeScanSessionId,
      });
      return;
    }

    manager.stopDeviceScan();
    this.scanning = false;
    console.debug('[BleBeaconService] Beacon scanning stopped', {
      reason,
      sessionId: this.activeScanSessionId,
    });
    this.activeScanSessionId = null;
  }

  subscribe(listener: (result: BeaconScanResult) => void): () => void {
    this.scanListeners.add(listener);

    return () => {
      this.scanListeners.delete(listener);
    };
  }

  subscribeToDiagnostics(listener: (diagnostic: BeaconScanDiagnostic) => void): () => void {
    this.diagnosticListeners.add(listener);

    return () => {
      this.diagnosticListeners.delete(listener);
    };
  }

  subscribeToRoomBinding(listener: (binding: RoomBinding | null) => void): () => void {
    this.roomBindingListeners.add(listener);

    if (this.currentRoomBinding) {
      listener(this.currentRoomBinding);
    }

    return () => {
      this.roomBindingListeners.delete(listener);
    };
  }

  getCurrentRoomBinding(): RoomBinding | null {
    return this.currentRoomBinding;
  }

  async destroy(): Promise<void> {
    const manager = this.manager;
    this.manager = null;

    console.debug('[BleBeaconService] Destroying BLE beacon service', {
      scanning: this.scanning,
      activeScanSessionId: this.activeScanSessionId,
      hasManager: Boolean(manager),
    });

    if (manager) {
      if (this.scanning) {
        manager.stopDeviceScan();
        console.debug('[BleBeaconService] Beacon scanning stopped', {
          reason: 'service-destroy',
          sessionId: this.activeScanSessionId,
        });
        this.scanning = false;
        this.activeScanSessionId = null;
      }
      await manager.destroy();
    }

    this.scanListeners.clear();
    this.diagnosticListeners.clear();
    this.roomBindingListeners.clear();
  }

  private handleScannedDevice(device: Device): void {
    const rssi = device.rssi ?? null;
    const baseContext = {
      deviceId: device.id ?? null,
      localName: device.localName ?? device.name ?? null,
    };

    const parsedManufacturerData = parseEsp32BeaconManufacturerData(device.manufacturerData);
    console.debug('[BleBeaconService] Received BLE advertisement', {
      ...baseContext,
      rssi,
      manufacturerDataLength: parsedManufacturerData.bytes?.length ?? 0,
      manufacturerDataPreview: this.formatManufacturerDataPreview(parsedManufacturerData.bytes),
    });

    if (rssi === null) {
      this.emitDiagnostic({
        ...baseContext,
        reason: 'missing-rssi',
        summary: '收到广播，但缺少 RSSI。',
        detail: 'react-native-ble-plx 返回的设备对象未包含 RSSI，当前无法参与房间判定。',
        rssi,
        major: null,
        manufacturerDataPreview: this.formatManufacturerDataPreview(parsedManufacturerData.bytes),
        updatedAt: Date.now(),
      });
      return;
    }

    if (!parsedManufacturerData.ok) {
      this.emitDiagnostic({
        ...baseContext,
        reason: parsedManufacturerData.reason,
        summary: this.describeDiagnosticSummary(parsedManufacturerData.reason),
        detail: parsedManufacturerData.detail,
        rssi,
        major: null,
        manufacturerDataPreview: this.formatManufacturerDataPreview(parsedManufacturerData.bytes),
        updatedAt: Date.now(),
      });
      return;
    }

    const { beacon } = parsedManufacturerData;
    const roomId = getRoomIdFromBeaconMajor(beacon.major);
    if (!roomId) {
      this.emitDiagnostic({
        ...baseContext,
        reason: 'unmapped-major',
        summary: '识别到自定义 Beacon，但 major 未命中房间映射。',
        detail: `Beacon major=${beacon.major}，当前 app 仅映射 ${Object.keys(appEnv.beaconRoomMapping).join(', ')}。`,
        rssi,
        major: beacon.major,
        manufacturerDataPreview: this.formatManufacturerDataPreview(parsedManufacturerData.bytes),
        updatedAt: Date.now(),
      });
      return;
    }

    const effectiveThreshold =
      this.lastRssi > RSSI_THRESHOLD ? RSSI_THRESHOLD - RSSI_HYSTERESIS : RSSI_THRESHOLD;

    if (rssi < effectiveThreshold) {
      this.emitDiagnostic({
        ...baseContext,
        reason: 'rssi-below-threshold',
        summary: '识别到 Beacon，但信号强度未达到绑定阈值。',
        detail: `Beacon major=${beacon.major}，RSSI=${rssi} dBm，当前阈值=${effectiveThreshold} dBm。`,
        rssi,
        major: beacon.major,
        manufacturerDataPreview: this.formatManufacturerDataPreview(parsedManufacturerData.bytes),
        updatedAt: Date.now(),
      });
      if (this.currentRoomBinding?.beaconId === String(beacon.major)) {
        this.updateRoomBinding(null);
      }
      return;
    }

    this.lastRssi = rssi;

    const result: BeaconScanResult = {
      deviceId: device.id,
      localName: device.localName ?? device.name,
      beaconId: String(beacon.major),
      uuid: appEnv.beaconUuid,
      major: beacon.major,
      minor: null,
      capability: beacon.capability,
      status: beacon.status,
      roomId,
      roomName: getRoomDisplayName(roomId),
      rssi,
      distance: rssiToDistance(rssi),
      rawManufacturerData: device.manufacturerData ?? '',
    };

    console.debug('[BleBeaconService] Recognized ESP32 beacon', {
      ...baseContext,
      roomId,
      major: beacon.major,
      version: beacon.version,
      rssi,
      distance: result.distance,
    });

    this.scanListeners.forEach(listener => {
      listener(result);
    });

    this.updateRoomBinding({
      roomId: result.roomId,
      roomName: result.roomName,
      beaconId: result.beaconId,
      rssi: result.rssi,
      distance: result.distance,
      updatedAt: Date.now(),
    });
  }

  private updateRoomBinding(binding: RoomBinding | null): void {
    const unchanged =
      this.currentRoomBinding?.roomId === binding?.roomId &&
      this.currentRoomBinding?.beaconId === binding?.beaconId;

    this.currentRoomBinding = binding;

    if (!unchanged) {
      this.roomBindingListeners.forEach(listener => {
        listener(binding);
      });
    }
  }

  private getAndroidPermissions(): AndroidPermission[] {
    const apiLevel = Number(Platform.Version);

    if (apiLevel >= 31) {
      return [
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ];
    }

    return [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
  }

  private async waitUntilPoweredOn(manager: BleManager): Promise<void> {
    const currentState = await manager.state();
    console.debug('[BleBeaconService] Current Bluetooth adapter state', {
      state: currentState,
    });

    if (currentState === 'PoweredOn') {
      return;
    }

    console.debug('[BleBeaconService] Waiting for Bluetooth adapter to reach PoweredOn state');

    await new Promise<void>((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        subscription.remove();
        reject(new Error('Bluetooth adapter did not reach PoweredOn state in time'));
      }, 10000);

      const subscription = manager.onStateChange(state => {
        console.debug('[BleBeaconService] Bluetooth adapter state changed', { state });
        if (state !== 'PoweredOn') {
          return;
        }

        clearTimeout(timeoutHandle);
        subscription.remove();
        resolve();
      }, true);
    });
  }

  private getManager(): BleManager {
    if (this.managerInitError) {
      throw this.managerInitError;
    }

    if (this.manager) {
      return this.manager;
    }

    // 检测是否在模拟器上运行
    if (Platform.OS === 'android' && !ExpoDevice.isDevice) {
      this.managerInitError = new Error(
        'BLE is not available on Android Emulator. Please use a physical device for Bluetooth functionality.'
      );
      throw this.managerInitError;
    }

    try {
      this.manager = new BleManager();
      return this.manager;
    } catch (error) {
      const message =
        'BLE native module is unavailable. Build and run a development build with `npm run prebuild` and `npm run android`, not Expo Go.';
      this.managerInitError =
        error instanceof Error ? new Error(`${message} ${error.message}`) : new Error(message);
      throw this.managerInitError;
    }
  }

  private emitDiagnostic(diagnostic: BeaconScanDiagnostic): void {
    console.debug('[BleBeaconService] Ignored BLE advertisement', diagnostic);
    this.diagnosticListeners.forEach(listener => {
      listener(diagnostic);
    });
  }

  private describeDiagnosticSummary(reason: BeaconScanDiagnostic['reason']): string {
    switch (reason) {
      case 'missing-rssi':
        return '收到广播，但缺少 RSSI。';
      case 'missing-manufacturer-data':
        return '收到广播，但没有 Manufacturer Data。';
      case 'invalid-base64':
        return 'Manufacturer Data 解码失败。';
      case 'payload-too-short':
        return 'Manufacturer Data 长度不足。';
      case 'unexpected-company-id':
        return 'Manufacturer Data 的 company id 不是 0xFFFF。';
      case 'unexpected-beacon-type':
        return 'Manufacturer Data 的 beacon type 不是 0x01。';
      case 'unmapped-major':
        return 'Beacon major 未命中房间映射。';
      case 'rssi-below-threshold':
        return 'Beacon RSSI 未达到绑定阈值。';
    }
  }

  private formatManufacturerDataPreview(bytes: Uint8Array | null): string | null {
    if (!bytes?.length) {
      return null;
    }

    return Array.from(bytes.slice(0, 10))
      .map(byte => byte.toString(16).toUpperCase().padStart(2, '0'))
      .join(' ');
  }
}
