import {
  parseEsp32BeaconManufacturerData,
  rssiToDistance,
} from '@/platform/ble/esp32-beacon-parser';

describe('parseEsp32BeaconManufacturerData', () => {
  beforeAll(() => {
    global.atob = (value: string) => Buffer.from(value, 'base64').toString('binary');
  });

  it('parses custom ESP32 beacon manufacturer data', () => {
    const bytes = Uint8Array.from([0xff, 0xff, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x02, 0x03]);
    const encoded = Buffer.from(bytes).toString('base64');

    expect(parseEsp32BeaconManufacturerData(encoded)).toEqual({
      major: 1,
      capability: 2,
      status: 3,
    });
  });

  it('rejects unrelated payloads', () => {
    expect(parseEsp32BeaconManufacturerData(null)).toBeNull();
    expect(parseEsp32BeaconManufacturerData(Buffer.from([0x01, 0x02]).toString('base64'))).toBeNull();
  });
});

describe('rssiToDistance', () => {
  it('returns null for zero RSSI and a positive estimate otherwise', () => {
    expect(rssiToDistance(0)).toBeNull();
    expect(rssiToDistance(-65)).toBeGreaterThan(0);
  });
});
