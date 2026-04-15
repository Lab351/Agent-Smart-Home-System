import { BleBeaconService } from '@/platform/ble/ble-beacon-service';

const mockStartDeviceScan = jest.fn();
const mockStopDeviceScan = jest.fn(async () => undefined);
const mockDestroy = jest.fn(async () => undefined);
const mockState = jest.fn(async () => 'PoweredOn');
const mockOnStateChange = jest.fn(() => ({
  remove: jest.fn(),
}));
let mockScannedDevice: Record<string, unknown> | null = null;

jest.mock('expo-device', () => ({
  isDevice: true,
}));

jest.mock('react-native-ble-plx', () => ({
  BleManager: jest.fn().mockImplementation(() => ({
    startDeviceScan: mockStartDeviceScan,
    stopDeviceScan: mockStopDeviceScan,
    destroy: mockDestroy,
    state: mockState,
    onStateChange: mockOnStateChange,
  })),
}));

jest.mock('react-native', () => ({
  Platform: {
    OS: 'android',
    Version: 33,
  },
  PermissionsAndroid: {
    PERMISSIONS: {
      BLUETOOTH_SCAN: 'android.permission.BLUETOOTH_SCAN',
      BLUETOOTH_CONNECT: 'android.permission.BLUETOOTH_CONNECT',
      ACCESS_FINE_LOCATION: 'android.permission.ACCESS_FINE_LOCATION',
    },
    RESULTS: {
      GRANTED: 'granted',
    },
    check: jest.fn(async () => true),
    requestMultiple: jest.fn(async () => ({
      'android.permission.BLUETOOTH_SCAN': 'granted',
      'android.permission.BLUETOOTH_CONNECT': 'granted',
      'android.permission.ACCESS_FINE_LOCATION': 'granted',
    })),
  },
}));

describe('BleBeaconService', () => {
  beforeAll(() => {
    global.atob = (value: string) => Buffer.from(value, 'base64').toString('binary');
  });

  beforeEach(() => {
    mockScannedDevice = {
      id: 'beacon-1',
      name: 'ESP32 Living Room',
      localName: 'ESP32 Living Room',
      rssi: -62,
      manufacturerData: Buffer.from(
        Uint8Array.from([0xff, 0xff, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x02, 0x03])
      ).toString('base64'),
    };
    mockStartDeviceScan.mockImplementation(async (_uuids, _options, listener) => {
      if (mockScannedDevice) {
        listener(null, mockScannedDevice);
      }
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('emits scan results and updates room binding from valid beacon data', async () => {
    const service = new BleBeaconService();
    const scanResults: string[] = [];
    const roomBindings: string[] = [];

    service.subscribe(result => {
      scanResults.push(result.roomId);
    });
    service.subscribeToRoomBinding(binding => {
      if (binding) {
        roomBindings.push(binding.roomId);
      }
    });

    await service.startScanning();

    expect(mockStartDeviceScan).toHaveBeenCalled();
    expect(scanResults).toEqual(['livingroom']);
    expect(roomBindings).toEqual(['livingroom']);
  });

  it('emits diagnostics when manufacturer data is missing', async () => {
    mockScannedDevice = {
      id: 'beacon-missing-md',
      localName: 'Unknown Beacon',
      rssi: -60,
      manufacturerData: null,
    };

    const service = new BleBeaconService();
    const diagnostics: string[] = [];

    service.subscribeToDiagnostics(diagnostic => {
      diagnostics.push(diagnostic.reason);
    });

    await service.startScanning();

    expect(diagnostics).toEqual(['missing-manufacturer-data']);
  });

  it('emits diagnostics when major is not mapped', async () => {
    mockScannedDevice = {
      id: 'beacon-unmapped-major',
      localName: 'ESP32 Guest Room',
      rssi: -60,
      manufacturerData: Buffer.from(
        Uint8Array.from([0xff, 0xff, 0x01, 0x00, 0x09, 0x00, 0x00, 0x00, 0x02, 0x03])
      ).toString('base64'),
    };

    const service = new BleBeaconService();
    const diagnostics: string[] = [];

    service.subscribeToDiagnostics(diagnostic => {
      diagnostics.push(diagnostic.reason);
    });

    await service.startScanning();

    expect(diagnostics).toEqual(['unmapped-major']);
  });

  it('emits diagnostics when company id does not match the custom protocol', async () => {
    mockScannedDevice = {
      id: 'beacon-other-company',
      localName: 'Other Beacon',
      rssi: -60,
      manufacturerData: Buffer.from(
        Uint8Array.from([0x34, 0x12, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x02, 0x03])
      ).toString('base64'),
    };

    const service = new BleBeaconService();
    const diagnostics: string[] = [];

    service.subscribeToDiagnostics(diagnostic => {
      diagnostics.push(diagnostic.reason);
    });

    await service.startScanning();

    expect(diagnostics).toEqual(['unexpected-company-id']);
  });
});
