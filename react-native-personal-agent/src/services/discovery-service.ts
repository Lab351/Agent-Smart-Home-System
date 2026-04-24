import { appEnv, getRoomDisplayName } from '@/config/env';
import { HttpClient } from '@/platform/network/http-client';
import type { AgentDiscoveryResult } from '@/types';

type DiscoveryResponse = {
  success?: boolean;
  data?: Record<string, unknown>;
};

type RegistryDiscoverResponse = {
  success?: boolean;
  data?: unknown;
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

      const enriched = await this.enrichWithRegistry(mapped);
      this.beaconCache.set(beaconId, enriched);
      this.roomCache.set(enriched.roomId, enriched);
      return enriched;
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

      const enriched = await this.enrichWithRegistry(mapped);
      this.beaconCache.set(enriched.beaconId, enriched);
      this.roomCache.set(roomId, enriched);
      return enriched;
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

  private async enrichWithRegistry(mapped: AgentDiscoveryResult): Promise<AgentDiscoveryResult> {
    if (!mapped.agentId) {
      console.debug('[DiscoveryService] Skip registry lookup because agent_id is missing', {
        beaconId: mapped.beaconId,
        roomId: mapped.roomId,
      });
      return mapped;
    }

    try {
      console.debug('[DiscoveryService] Querying registry for room-agent', {
        beaconId: mapped.beaconId,
        roomId: mapped.roomId,
        agentId: mapped.agentId,
      });
      const response = await this.http.get<RegistryDiscoverResponse>(
        `/api/registry/discover?agent_id=${encodeURIComponent(mapped.agentId)}`
      );
      const agentCard = this.pickRegistryAgent(response.data, mapped.agentId);

      if (!agentCard) {
        console.debug('[DiscoveryService] Registry did not return a matching room-agent', {
          beaconId: mapped.beaconId,
          roomId: mapped.roomId,
          agentId: mapped.agentId,
        });
        return mapped;
      }

      const enriched = this.mergeRegistryInfo(mapped, agentCard);
      console.debug('[DiscoveryService] Registry room-agent resolved', {
        beaconId: enriched.beaconId,
        roomId: enriched.roomId,
        agentId: enriched.agentId,
        url: enriched.url,
        documentationUrl: enriched.documentationUrl,
      });
      return enriched;
    } catch (error) {
      console.warn('[DiscoveryService] Failed to fetch room-agent registry entry', {
        beaconId: mapped.beaconId,
        roomId: mapped.roomId,
        agentId: mapped.agentId,
        error,
      });
      return mapped;
    }
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
      agentName: typeof value.name === 'string' ? value.name : null,
      agentType: typeof value.agent_type === 'string' ? value.agent_type : null,
      url: typeof value.url === 'string' ? value.url : null,
      documentationUrl:
        typeof value.documentation_url === 'string'
          ? value.documentation_url
          : typeof value.documentationUrl === 'string'
            ? value.documentationUrl
            : null,
      capabilities: Array.isArray(value.capabilities)
        ? value.capabilities.map(item => String(item))
        : [],
      devices: this.mapDevices(value.devices),
      metadata: value,
    };
  }

  private pickRegistryAgent(data: unknown, agentId: string): Record<string, unknown> | null {
    const records = Array.isArray(data)
      ? data
      : data && typeof data === 'object'
        ? [data]
        : [];

    const agents = records.filter(
      (item): item is Record<string, unknown> => item !== null && typeof item === 'object'
    );

    return agents.find(agent => agent.id === agentId || agent.agent_id === agentId) ?? agents[0] ?? null;
  }

  private mergeRegistryInfo(
    mapped: AgentDiscoveryResult,
    agentCard: Record<string, unknown>
  ): AgentDiscoveryResult {
    const registryDevices = this.mapDevices(agentCard.devices);
    const registryCapabilities = Array.isArray(agentCard.capabilities)
      ? agentCard.capabilities.map(item => String(item))
      : [];
    const metadata =
      agentCard.metadata && typeof agentCard.metadata === 'object'
        ? (agentCard.metadata as Record<string, unknown>)
        : {};

    return {
      ...mapped,
      agentId: typeof agentCard.id === 'string' ? agentCard.id : mapped.agentId,
      agentName: typeof agentCard.name === 'string' ? agentCard.name : mapped.agentName ?? null,
      agentType:
        typeof agentCard.agent_type === 'string'
          ? agentCard.agent_type
          : mapped.agentType ?? null,
      url: typeof agentCard.url === 'string' ? agentCard.url : mapped.url ?? null,
      documentationUrl:
        typeof agentCard.documentation_url === 'string'
          ? agentCard.documentation_url
          : mapped.documentationUrl ?? null,
      capabilities: registryCapabilities.length > 0 ? registryCapabilities : mapped.capabilities,
      devices: registryDevices.length > 0 ? registryDevices : mapped.devices,
      metadata: {
        ...(mapped.metadata ?? {}),
        registry: agentCard,
        registry_metadata: metadata,
      },
    };
  }

  private mapDevices(value: unknown): AgentDiscoveryResult['devices'] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.map(item => {
      const record = item as Record<string, unknown>;
      return {
        id: String(record.id ?? ''),
        name: typeof record.name === 'string' ? record.name : undefined,
        type: typeof record.type === 'string' ? record.type : undefined,
      };
    });
  }
}
