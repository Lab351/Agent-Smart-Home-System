type ParsedEsp32Beacon = {
  major: number;
  capability: number | null;
  status: number | null;
};

export function parseEsp32BeaconManufacturerData(
  manufacturerData: string | null
): ParsedEsp32Beacon | null {
  if (!manufacturerData) {
    return null;
  }

  const bytes = decodeBase64(manufacturerData);
  if (bytes.length < 10) {
    return null;
  }

  const companyId = bytes[0] | (bytes[1] << 8);
  if (companyId !== 0xffff) {
    return null;
  }

  const beaconType = bytes[2];
  if (beaconType !== 0x01) {
    return null;
  }

  return {
    major: bytes[4] | (bytes[5] << 8) | (bytes[6] << 16) | (bytes[7] << 24),
    capability: bytes[8] ?? null,
    status: bytes[9] ?? null,
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
