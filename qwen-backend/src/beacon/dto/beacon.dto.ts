export class BeaconRegistrationDto {
  beacon_id: string;
  room_id: string;
  agent_id: string;
  mqtt_broker: string;
  mqtt_ws_port?: number;
  capabilities?: string[];
  devices?: Array<{
    id: string;
    name: string;
    type: string;
  }>;
}

export interface BeaconInfo {
  beacon_id: string;
  room_id: string;
  agent_id: string;
  mqtt_broker: string;
  mqtt_ws_port?: number;
  capabilities?: string[];
  devices?: Array<{
    id: string;
    name: string;
    type: string;
  }>;
  registered_at: string;
  last_heartbeat: string;
}
