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
  url?: string | null;
  mqttBroker?: string | null;
  mqttWsPort?: number | null;
  devices: AgentDeviceDescriptor[];
  capabilities: string[];
  metadata?: Record<string, unknown>;
}

export interface ParsedIntent {
  text: string;
  device: string | null;
  action: string | null;
  room: string | null;
  parameters: Record<string, unknown>;
  confidence: number;
  source: 'llm' | 'fallback';
  routing?: {
    target: 'room-agent' | 'home-agent';
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
  route: 'room-agent' | 'home-agent' | 'unresolved';
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
