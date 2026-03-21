import Constants from 'expo-constants';

const roomDisplayNames = {
  livingroom: '客厅',
  bedroom: '卧室',
  study: '书房',
  kitchen: '厨房',
  bathroom: '浴室',
} as const;

const beaconRoomMapping = {
  1: 'livingroom',
  2: 'bedroom',
  3: 'study',
  4: 'kitchen',
} as const;

type AppExtra = {
  userId?: string;
  backendUrl?: string;
  mqttHost?: string;
  mqttWsPort?: number;
  beaconUuid?: string;
};

const extra = (Constants.expoConfig?.extra ?? {}) as AppExtra;

export const appEnv = {
  userId: extra.userId ?? 'user1',
  backendUrl: extra.backendUrl ?? 'http://120.78.228.69:3088',
  mqttHost: extra.mqttHost ?? '120.78.228.69',
  mqttWsPort: Number(extra.mqttWsPort ?? 9002),
  beaconUuid: extra.beaconUuid ?? '01234567-89AB-CDEF-0123456789ABCDEF',
  beaconRoomMapping,
  roomDisplayNames,
};

export function getRoomDisplayName(roomId: string): string {
  return appEnv.roomDisplayNames[roomId as keyof typeof roomDisplayNames] ?? roomId;
}

export function getRoomIdFromBeaconMajor(major: number): string | null {
  return appEnv.beaconRoomMapping[major as keyof typeof beaconRoomMapping] ?? null;
}
