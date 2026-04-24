export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';

export type HabitCategory = 'lighting' | 'climate' | 'entertainment' | 'general';

export interface Habit {
  id: string;
  content: string;
  category: HabitCategory;
  timestamp: number;
  frequency: number;
  active: boolean;
}

export interface UserPreferences {
  habits: Habit[];
  preferences: {
    defaultRoom: string;
    lighting: {
      bedtime: string;
      preferredBrightness: number;
    };
    climate: {
      preferredTemp: number;
      mode: 'cool' | 'heat' | 'dry' | 'auto';
    };
  };
  lastUpdated: number;
}

export interface RoomBinding {
  roomId: string;
  roomName: string;
  beaconId: string | null;
  rssi: number | null;
  distance: number | null;
  updatedAt: number;
}

export interface BeaconScanResult {
  deviceId: string;
  localName: string | null;
  beaconId: string;
  uuid: string;
  major: number;
  minor: number | null;
  capability: number | null;
  status: number | null;
  roomId: string;
  roomName: string;
  rssi: number;
  distance: number | null;
  rawManufacturerData: string;
}

export type BeaconScanDiagnosticReason =
  | 'missing-rssi'
  | 'missing-manufacturer-data'
  | 'invalid-base64'
  | 'payload-too-short'
  | 'unexpected-company-id'
  | 'unexpected-beacon-type'
  | 'unmapped-major'
  | 'rssi-below-threshold';

export interface BeaconScanDiagnostic {
  deviceId: string | null;
  localName: string | null;
  reason: BeaconScanDiagnosticReason;
  summary: string;
  detail: string;
  rssi: number | null;
  major: number | null;
  manufacturerDataPreview: string | null;
  updatedAt: number;
}

export type BeaconScanIssueCode =
  | 'permission-denied'
  | 'emulator-unsupported'
  | 'bluetooth-powered-off'
  | 'bluetooth-unavailable'
  | 'unknown';

export interface BeaconScanIssue {
  code: BeaconScanIssueCode;
  summary: string;
  detail: string;
  updatedAt: number;
}

export interface AgentDeviceDescriptor {
  id: string;
  name?: string;
  type?: string;
}

export interface AgentDiscoveryResult {
  beaconId: string;
  roomId: string;
  roomName: string;
  agentId: string;
  agentName?: string | null;
  agentType?: string | null;
  url?: string | null;
  documentationUrl?: string | null;
  devices: AgentDeviceDescriptor[];
  capabilities: string[];
  metadata?: Record<string, unknown>;
}

export type IntentKind = 'chat' | 'agent_message';

export interface ParsedIntentQuery {
  type: 'room_devices' | 'room_state';
  roomId?: string | null;
  reason?: string;
}

export interface ParsedIntent {
  text: string;
  kind: IntentKind;
  device: string | null;
  action: string | null;
  room: string | null;
  parameters: Record<string, unknown>;
  confidence: number;
  source: 'llm' | 'fallback';
  reply?: string | null;
  query?: ParsedIntentQuery | null;
  routing?: {
    target: 'room-agent' | 'home-agent' | null;
    roomId?: string | null;
    agentId?: string | null;
    reason?: string;
  };
}

export interface VoiceRecognitionResult {
  text: string;
  confidence?: number | null;
  durationMillis?: number;
  uri?: string;
  raw?: unknown;
}

export type ControlTaskState =
  | 'submitted'
  | 'working'
  | 'input-required'
  | 'auth-required'
  | 'completed'
  | 'failed'
  | 'canceled'
  | 'rejected'
  | 'unknown';

export interface ControlTaskAction {
  kind: 'auth' | 'input';
  label: string | null;
  description: string | null;
  url: string | null;
  callbackUrl: string | null;
}

export type TaskActionCallbackQueryValue = string | string[];

export interface TaskActionCallbackResult {
  rawUrl: string;
  hostname: string | null;
  path: string | null;
  queryParams: Record<string, TaskActionCallbackQueryValue>;
  receivedAt: number;
}

export interface ControlTaskStateUpdate {
  taskId: string | null;
  contextId: string | null;
  roomId: string | null;
  traceId?: string | null;
  latencyMs?: number | null;
  state: ControlTaskState;
  success: boolean;
  isTerminal: boolean;
  isInterrupted: boolean;
  detail: string;
  action: ControlTaskAction | null;
  raw: unknown;
}

export interface RoomAgentSnapshotDevice {
  id: string;
  name: string;
  type: string | null;
}

export interface RoomAgentSnapshotSkill {
  id: string;
  name: string;
  description: string | null;
  tags: string[];
}

export interface RoomAgentSnapshot {
  roomId: string | null;
  roomName: string | null;
  agentId: string | null;
  agentName: string | null;
  agentType: string | null;
  agentDescription: string | null;
  agentVersion: string | null;
  devices: RoomAgentSnapshotDevice[];
  capabilities: string[];
  skills: RoomAgentSnapshotSkill[];
  note: string;
  updatedAt: number;
  raw: unknown;
}

export interface VoiceCommandExecutionResult {
  executedAt: number;
  success: boolean;
  input: string;
  status: string;
  detail: string;
  route: 'chat' | 'query' | 'room-agent' | 'home-agent' | 'unresolved';
  intent: ParsedIntent;
  roomId: string | null;
  roomName: string | null;
  agentId?: string | null;
  taskId?: string | null;
  taskContextId?: string | null;
  taskState?: ControlTaskState | null;
  taskTerminal?: boolean;
  taskInterrupted?: boolean;
  taskAction?: ControlTaskAction | null;
}
