import type { BeaconScanDiagnostic, BeaconScanResult, RoomBinding } from '@/types/domain';

export type PermissionState = 'granted' | 'denied' | 'undetermined';

export interface PermissionSnapshot {
  granted: boolean;
  canAskAgain: boolean;
  status: PermissionState;
}

export interface AudioRecorderSnapshot {
  canRecord: boolean;
  isRecording: boolean;
  durationMillis: number;
  metering?: number;
  uri: string | null;
}

export interface AudioRecordingResult {
  uri: string;
  durationMillis: number;
  fileName: string;
  mimeType: string;
}

export type BeaconScanStopReason =
  | 'user-toggle'
  | 'unbind-room'
  | 'coordinator-stop'
  | 'coordinator-destroy'
  | 'service-destroy'
  | 'unspecified';

export interface IStorageService {
  getString(key: string): Promise<string | null>;
  getJson<T>(key: string): Promise<T | null>;
  setString(key: string, value: string): Promise<void>;
  setJson(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface IAudioRecordService {
  getPermissionStatus(): Promise<PermissionSnapshot>;
  requestPermissions(): Promise<PermissionSnapshot>;
  startRecording(): Promise<void>;
  stopRecording(): Promise<AudioRecordingResult | null>;
  cancelRecording(): Promise<void>;
  getRecorderState(): AudioRecorderSnapshot | null;
}

export interface IBleBeaconService {
  getPermissionStatus(): Promise<PermissionSnapshot>;
  requestPermissions(): Promise<PermissionSnapshot>;
  startScanning(): Promise<void>;
  stopScanning(reason?: BeaconScanStopReason): Promise<void>;
  subscribe(listener: (result: BeaconScanResult) => void): () => void;
  subscribeToDiagnostics(listener: (diagnostic: BeaconScanDiagnostic) => void): () => void;
  subscribeToRoomBinding(listener: (binding: RoomBinding | null) => void): () => void;
  getCurrentRoomBinding(): RoomBinding | null;
  destroy(): Promise<void>;
}
