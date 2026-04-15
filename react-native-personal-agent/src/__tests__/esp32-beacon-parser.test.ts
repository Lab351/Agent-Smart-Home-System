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
      ok: true,
      bytes,
      beacon: {
        companyId: 0xffff,
        beaconType: 0x01,
        version: 0,
        major: 1,
        capability: 2,
        status: 3,
        dataOffset: 0,
      },
    });
  });

  it('parses payloads that still include the BLE AD structure prefix', () => {
    const bytes = Uint8Array.from([0x0b, 0xff, 0xff, 0xff, 0x01, 0x01, 0x02, 0x00, 0x00, 0x00, 0x04, 0x05]);
    const encoded = Buffer.from(bytes).toString('base64');

    expect(parseEsp32BeaconManufacturerData(encoded)).toEqual({
      ok: true,
      bytes,
      beacon: {
        companyId: 0xffff,
        beaconType: 0x01,
        version: 1,
        major: 2,
        capability: 4,
        status: 5,
        dataOffset: 2,
      },
    });
  });

  it('returns detailed diagnostics for invalid payloads', () => {
    expect(parseEsp32BeaconManufacturerData(null)).toEqual({
      ok: false,
      reason: 'missing-manufacturer-data',
      detail: 'BLE device did not expose manufacturer data.',
      bytes: null,
    });

    expect(parseEsp32BeaconManufacturerData(Buffer.from([0x01, 0x02]).toString('base64'))).toEqual({
      ok: false,
      reason: 'payload-too-short',
      detail: 'Expected at least 10 bytes of manufacturer payload, received 2.',
      bytes: Uint8Array.from([0x01, 0x02]),
    });

    expect(
      parseEsp32BeaconManufacturerData(
        Buffer.from([0x34, 0x12, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x02, 0x03]).toString('base64')
      )
    ).toEqual({
      ok: false,
      reason: 'unexpected-company-id',
      detail: 'Expected company id 0xFFFF, received 0x1234.',
      bytes: Uint8Array.from([0x34, 0x12, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x02, 0x03]),
    });

    expect(
      parseEsp32BeaconManufacturerData(
        Buffer.from([0xff, 0xff, 0x02, 0x00, 0x01, 0x00, 0x00, 0x00, 0x02, 0x03]).toString('base64')
      )
    ).toEqual({
      ok: false,
      reason: 'unexpected-beacon-type',
      detail: 'Expected beacon type 0x01, received 0x02.',
      bytes: Uint8Array.from([0xff, 0xff, 0x02, 0x00, 0x01, 0x00, 0x00, 0x00, 0x02, 0x03]),
    });
  });
});

describe('rssiToDistance', () => {
  it('returns null for zero RSSI and a positive estimate otherwise', () => {
    expect(rssiToDistance(0)).toBeNull();
    expect(rssiToDistance(-65)).toBeGreaterThan(0);
  });
});
