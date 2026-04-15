import { Type } from 'class-transformer';
import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';

export class BeaconDeviceDto {
  @IsString()
  id: string;

  @IsString()
  name: string;

  @IsString()
  type: string;
}

export class BeaconRegistrationDto {
  @IsString()
  beacon_id: string;

  @IsString()
  room_id: string;

  @IsString()
  agent_id: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  capabilities?: string[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BeaconDeviceDto)
  @IsOptional()
  devices?: BeaconDeviceDto[];
}

export interface BeaconInfo {
  beacon_id: string;
  room_id: string;
  agent_id: string;
  capabilities?: string[];
  devices?: Array<{
    id: string;
    name: string;
    type: string;
  }>;
  registered_at: string;
  last_heartbeat: string;
}
