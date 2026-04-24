import { Type } from 'class-transformer';
import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class DeviceInfo {
  @IsString()
  @IsNotEmpty()
  id: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  type: string;
}

export class RoomDevices {
  @IsString()
  @IsNotEmpty()
  room: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DeviceInfo)
  devices: DeviceInfo[];
}

export class IntentContext {
  @IsOptional()
  @IsString()
  current_room?: string;

  @IsOptional()
  @IsString()
  current_beacon_id?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RoomDevices)
  available_devices?: RoomDevices[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConversationMessage)
  conversation_history?: ConversationMessage[];
}

export class IntentParseDto {
  @IsString()
  @IsNotEmpty()
  text: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => IntentContext)
  context?: IntentContext;
}

export class ConversationMessage {
  @IsString()
  @IsNotEmpty()
  role: string;

  @IsString()
  @IsNotEmpty()
  content: string;
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
