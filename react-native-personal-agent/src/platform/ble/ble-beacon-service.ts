import { BleManager, type Device } from 'react-native-ble-plx';
import { PermissionsAndroid, Platform } from 'react-native';

import { appEnv, getRoomDisplayName, getRoomIdFromBeaconMajor } from '@/config/env';
import {
  parseEsp32BeaconManufacturerData,
  rssiToDistance,
} from '@/platform/ble/esp32-beacon-parser';
import type {
  BeaconScanResult,
  IBleBeaconService,
  PermissionSnapshot,
  RoomBinding,
} from '@/types';

const RSSI_THRESHOLD = -70;
const RSSI_HYSTERESIS = 5;
type AndroidPermission =
  (typeof PermissionsAndroid.PERMISSIONS)[keyof typeof PermissionsAndroid.PERMISSIONS];

export class BleBeaconService implements IBleBeaconService {
  private readonly manager = new BleManager();
  private readonly scanListeners = new Set<(result: BeaconScanResult) => void>();
  private readonly roomBindingListeners = new Set<(binding: RoomBinding | null) => void>();
  private scanning = false;
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
    if (this.scanning) {
      return;
    }

    const currentPermission = await this.getPermissionStatus();
    const permission = currentPermission.granted
      ? currentPermission
      : await this.requestPermissions();

    if (!permission.granted) {
      throw new Error('Bluetooth permissions are not granted');
    }

    await this.waitUntilPoweredOn();

    await this.manager.startDeviceScan(null, { allowDuplicates: true }, (error, device) => {
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
  }

  async stopScanning(): Promise<void> {
    if (!this.scanning) {
      return;
    }

    await this.manager.stopDeviceScan();
    this.scanning = false;
  }

  subscribe(listener: (result: BeaconScanResult) => void): () => void {
    this.scanListeners.add(listener);

    return () => {
      this.scanListeners.delete(listener);
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
    await this.stopScanning();
    await this.manager.destroy();
    this.scanListeners.clear();
    this.roomBindingListeners.clear();
  }

  private handleScannedDevice(device: Device): void {
    const rssi = device.rssi ?? null;
    if (rssi === null) {
      return;
    }

    const beacon = parseEsp32BeaconManufacturerData(device.manufacturerData);
    if (!beacon) {
      return;
    }

    const roomId = getRoomIdFromBeaconMajor(beacon.major);
    if (!roomId) {
      return;
    }

    const effectiveThreshold =
      this.lastRssi > RSSI_THRESHOLD ? RSSI_THRESHOLD - RSSI_HYSTERESIS : RSSI_THRESHOLD;

    if (rssi < effectiveThreshold) {
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

  private async waitUntilPoweredOn(): Promise<void> {
    const currentState = await this.manager.state();
    if (currentState === 'PoweredOn') {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        subscription.remove();
        reject(new Error('Bluetooth adapter did not reach PoweredOn state in time'));
      }, 10000);

      const subscription = this.manager.onStateChange(state => {
        if (state !== 'PoweredOn') {
          return;
        }

        clearTimeout(timeoutHandle);
        subscription.remove();
        resolve();
      }, true);
    });
  }
}
