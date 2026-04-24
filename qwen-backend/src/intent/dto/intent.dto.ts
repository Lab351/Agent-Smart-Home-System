export class DeviceInfo {
  id: string;
  name: string;
  type: string;
}

export class RoomDevices {
  room: string;
  devices: DeviceInfo[];
}

export class IntentContext {
  current_room?: string;
  current_beacon_id?: string;
  available_devices?: RoomDevices[];
  conversation_history?: Array<{ role: string; content: string }>;
}

export class IntentParseDto {
  text: string;
  context?: IntentContext;
}

export class ParsedIntent {
  device: string | null;
  action: string | null;
  parameters: Record<string, any>;
  confidence: number;
}

export class IntentQuery {
  type: 'room_devices' | 'room_state';
  room_id?: string | null;
  reason: string;
}

export class RoutingDecision {
  target: 'room-agent' | 'home-agent' | null;
  room_id?: string | null;
  agent_id?: string | null;
  reason: string;
}

export class IntentParseResult {
  kind: 'chat' | 'query' | 'action';
  reply?: string | null;
  query?: IntentQuery | null;
  intent?: ParsedIntent | null;
  routing?: RoutingDecision | null;
  raw_response?: string;
}

export interface IntentParseResponseDto {
  success: boolean;
  data?: IntentParseResult;
  message?: string;
}
