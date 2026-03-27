import { appEnv, getRoomDisplayName } from '@/config/env';
import { HttpClient } from '@/platform/network/http-client';
import type { AgentDiscoveryResult } from '@/types';

type DiscoveryResponse = {
  success?: boolean;
  data?: Record<string, unknown>;
};

export class DiscoveryService {
  private readonly beaconCache = new Map<string, AgentDiscoveryResult>();
  private readonly roomCache = new Map<string, AgentDiscoveryResult>();

  constructor(private readonly http = new HttpClient(appEnv.backendUrl)) {}

  async getRoomAgentByBeacon(beaconId: string): Promise<AgentDiscoveryResult | null> {
    const cached = this.beaconCache.get(beaconId);
    if (cached) {
      return cached;
    }

    try {
      const response = await this.http.get<DiscoveryResponse>(`/api/beacon/${beaconId}`);
      const mapped = this.mapDiscoveryResponse(response.data, beaconId);

      if (!mapped) {
        return null;
      }

      this.beaconCache.set(beaconId, mapped);
      this.roomCache.set(mapped.roomId, mapped);
      return mapped;
    } catch (error) {
      console.warn('[DiscoveryService] Failed to fetch beacon mapping', error);
      return null;
    }
  }

  async getRoomAgentByRoomId(roomId: string): Promise<AgentDiscoveryResult | null> {
    const cached = this.roomCache.get(roomId);
    if (cached) {
      return cached;
    }

    try {
      const response = await this.http.get<DiscoveryResponse>(`/api/beacon/room/${roomId}`);
      const mapped = this.mapDiscoveryResponse(response.data);

      if (!mapped) {
        return null;
      }

      this.beaconCache.set(mapped.beaconId, mapped);
      this.roomCache.set(roomId, mapped);
      return mapped;
    } catch (error) {
      console.warn('[DiscoveryService] Failed to fetch room mapping', error);
      return null;
    }
  }

  async getAllRoomAgents(): Promise<AgentDiscoveryResult[]> {
    try {
      const response = await this.http.get<{ success?: boolean; data?: Record<string, unknown> }>(
        '/api/beacon/list'
      );

      const records = response.data ?? {};
      return Object.entries(records)
        .map(([beaconId, value]) => this.mapDiscoveryResponse(value as Record<string, unknown>, beaconId))
        .filter((value): value is AgentDiscoveryResult => Boolean(value));
    } catch (error) {
      console.warn('[DiscoveryService] Failed to fetch room agent list', error);
      return [];
    }
  }

  refreshCache(): void {
    this.beaconCache.clear();
    this.roomCache.clear();
  }

  destroy(): void {
    this.refreshCache();
  }

  private mapDiscoveryResponse(
    value?: Record<string, unknown>,
    fallbackBeaconId?: string
  ): AgentDiscoveryResult | null {
    if (!value) {
      return null;
    }

    const roomId = String(value.room_id ?? value.roomId ?? '');
    const beaconId = String(value.beacon_id ?? fallbackBeaconId ?? '');
    const agentId = String(value.agent_id ?? value.agentId ?? roomId);

    if (!roomId || !beaconId) {
      return null;
    }

    return {
      beaconId,
      roomId,
      roomName: String(value.room_name ?? getRoomDisplayName(roomId)),
      agentId,
      url: typeof value.url === 'string' ? value.url : null,
      mqttBroker: typeof value.mqtt_broker === 'string' ? value.mqtt_broker : null,
      mqttWsPort:
        typeof value.mqtt_ws_port === 'number'
          ? value.mqtt_ws_port
          : value.mqtt_ws_port
            ? Number(value.mqtt_ws_port)
            : null,
      capabilities: Array.isArray(value.capabilities)
        ? value.capabilities.map(item => String(item))
        : [],
      devices: Array.isArray(value.devices)
        ? value.devices.map(item => ({
            id: String((item as Record<string, unknown>).id ?? ''),
            name:
              typeof (item as Record<string, unknown>).name === 'string'
                ? String((item as Record<string, unknown>).name)
                : undefined,
            type:
              typeof (item as Record<string, unknown>).type === 'string'
                ? String((item as Record<string, unknown>).type)
                : undefined,
          }))
        : [],
      metadata: value,
    };
  }
}
