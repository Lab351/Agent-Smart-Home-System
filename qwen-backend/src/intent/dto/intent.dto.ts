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

export class RoutingDecision {
  target: 'room-agent' | 'home-agent';
  room_id?: string;
  agent_id?: string;
  reason: string;
}

export class IntentParseResult {
  intent: ParsedIntent;
  routing: RoutingDecision;
  raw_response?: string;
}

export interface IntentParseResponseDto {
  success: boolean;
  data?: IntentParseResult;
  message?: string;
}