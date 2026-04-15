export type ParsedEsp32Beacon = {
  companyId: number;
  beaconType: number;
  version: number;
  major: number;
  capability: number | null;
  status: number | null;
  dataOffset: number;
};

export type Esp32BeaconParseFailureReason =
  | 'missing-manufacturer-data'
  | 'invalid-base64'
  | 'payload-too-short'
  | 'unexpected-company-id'
  | 'unexpected-beacon-type';

export type Esp32BeaconParseResult =
  | {
      ok: true;
      beacon: ParsedEsp32Beacon;
      bytes: Uint8Array;
    }
  | {
      ok: false;
      reason: Esp32BeaconParseFailureReason;
      detail: string;
      bytes: Uint8Array | null;
    };

export function parseEsp32BeaconManufacturerData(
  manufacturerData: string | null
): Esp32BeaconParseResult {
  if (!manufacturerData) {
    return {
      ok: false,
      reason: 'missing-manufacturer-data',
      detail: 'BLE device did not expose manufacturer data.',
      bytes: null,
    };
  }

  let bytes: Uint8Array;
  try {
    bytes = decodeBase64(manufacturerData);
  } catch (error) {
    return {
      ok: false,
      reason: 'invalid-base64',
      detail:
        error instanceof Error
          ? `Failed to decode manufacturer data: ${error.message}`
          : 'Failed to decode manufacturer data.',
      bytes: null,
    };
  }

  const candidateOffsets = bytes[1] === 0xff ? [2, 0] : [0];
  let sawPayload = false;
  let unexpectedCompanyId: number | null = null;
  let unexpectedBeaconType: number | null = null;

  for (const dataOffset of candidateOffsets) {
    if (bytes.length - dataOffset < 10) {
      continue;
    }

    sawPayload = true;

    const companyId = bytes[dataOffset] | (bytes[dataOffset + 1] << 8);
    if (companyId !== 0xffff) {
      unexpectedCompanyId = companyId;
      continue;
    }

    const beaconType = bytes[dataOffset + 2];
    if (beaconType !== 0x01) {
      unexpectedBeaconType = beaconType;
      continue;
    }

    return {
      ok: true,
      bytes,
      beacon: {
        companyId,
        beaconType,
        version: bytes[dataOffset + 3] ?? 0,
        major:
          bytes[dataOffset + 4] |
          (bytes[dataOffset + 5] << 8) |
          (bytes[dataOffset + 6] << 16) |
          (bytes[dataOffset + 7] << 24),
        capability: bytes[dataOffset + 8] ?? null,
        status: bytes[dataOffset + 9] ?? null,
        dataOffset,
      },
    };
  }

  if (!sawPayload) {
    return {
      ok: false,
      reason: 'payload-too-short',
      detail: `Expected at least 10 bytes of manufacturer payload, received ${bytes.length}.`,
      bytes,
    };
  }

  return {
    ok: false,
    reason: unexpectedCompanyId !== null ? 'unexpected-company-id' : 'unexpected-beacon-type',
    detail:
      unexpectedCompanyId !== null
        ? `Expected company id 0xFFFF, received 0x${unexpectedCompanyId
            .toString(16)
            .toUpperCase()
            .padStart(4, '0')}.`
        : `Expected beacon type 0x01, received 0x${(unexpectedBeaconType ?? 0)
            .toString(16)
            .toUpperCase()
            .padStart(2, '0')}.`,
    bytes,
  };
}

export function rssiToDistance(rssi: number, txPower: number = -59): number | null {
  if (rssi === 0) {
    return null;
  }

  const ratio = rssi / txPower;
  if (ratio < 1) {
    return Math.pow(ratio, 10);
  }

  return 0.89976 * Math.pow(ratio, 7.7095) + 0.111;
}

function decodeBase64(value: string): Uint8Array {
  if (typeof globalThis.atob !== 'function') {
    throw new Error('Base64 decoding is unavailable in this runtime');
  }

  const padding = value.length % 4 === 0 ? '' : '='.repeat(4 - (value.length % 4));
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/') + padding;
  const binary = globalThis.atob(normalized);

  return Uint8Array.from(binary, char => char.charCodeAt(0));
}
