import { UnavailableControlTransport } from '@/services/transports/unavailable-control-transport';
import type {
  AgentDiscoveryResult,
  ControlDispatchResult,
  ControlTaskStateUpdate,
  IControlTransport,
} from '@/types';

export class ControlService {
  private readonly roomAgents = new Map<string, string>();
  private transport: IControlTransport;

  constructor(
    private readonly personalAgentId: string,
    transport: IControlTransport = new UnavailableControlTransport()
  ) {
    this.transport = transport;
  }

  setTransport(transport: IControlTransport): void {
    if (this.transport !== transport) {
      void this.transport.disconnect();
    }

    this.transport = transport;
  }

  getTransport(): IControlTransport {
    return this.transport;
  }

  async connect(agentInfo: AgentDiscoveryResult | null, roomId?: string): Promise<boolean> {
    const roomAgentId = roomId ? this.getAgentIdForRoom(roomId) : null;

    return this.transport.connect({
      personalAgentId: this.personalAgentId,
      roomId,
      roomAgentId,
      agentInfo,
    });
  }

  async sendControl(
    roomId: string,
    utterance: string,
    targetDevice: string,
    action: string,
    parameters: Record<string, unknown> = {},
    options?: {
      taskId?: string | null;
      contextId?: string | null;
      metadata?: Record<string, unknown>;
    }
  ): Promise<ControlDispatchResult> {
    const roomAgentId = this.getAgentIdForRoom(roomId);
    if (!roomAgentId || !this.transport.isConnected()) {
      return {
        success: false,
        taskId: null,
        contextId: null,
        state: 'unknown',
        isTerminal: true,
        isInterrupted: false,
        detail: '控制通道尚未建立',
        action: null,
        raw: null,
      };
    }

    return this.transport.sendControl({
      roomId,
      roomAgentId,
      utterance,
      targetDevice,
      action,
      parameters,
      taskId: options?.taskId,
      contextId: options?.contextId,
      metadata: options?.metadata,
      sourceAgent: this.personalAgentId,
    });
  }

  async queryCapabilities(roomId: string, agentInfo?: AgentDiscoveryResult | null): Promise<unknown> {
    const roomAgentId = this.getAgentIdForRoom(roomId);
    if (!roomAgentId || !this.transport.isConnected()) {
      return null;
    }

    return this.transport.queryCapabilities({
      roomId,
      roomAgentId,
      sourceAgent: this.personalAgentId,
      agentInfo,
    });
  }

  async queryRoomState(
    roomId: string,
    utterance: string,
    options?: {
      metadata?: Record<string, unknown>;
    }
  ): Promise<ControlDispatchResult> {
    return this.queryRoom(roomId, utterance, 'room_state', options);
  }

  async queryRoomDevices(
    roomId: string,
    utterance: string,
    options?: {
      metadata?: Record<string, unknown>;
    }
  ): Promise<ControlDispatchResult> {
    return this.queryRoom(roomId, utterance, 'room_devices', options);
  }

  private async queryRoom(
    roomId: string,
    utterance: string,
    queryType: 'room_state' | 'room_devices',
    options?: {
      metadata?: Record<string, unknown>;
    }
  ): Promise<ControlDispatchResult> {
    const roomAgentId = this.getAgentIdForRoom(roomId);
    if (!roomAgentId || !this.transport.isConnected()) {
      return {
        success: false,
        taskId: null,
        contextId: null,
        state: 'unknown',
        isTerminal: true,
        isInterrupted: false,
        detail: '查询通道尚未建立',
        action: null,
        raw: null,
      };
    }

    return this.transport.sendQuery({
      roomId,
      roomAgentId,
      utterance,
      queryType,
      metadata: options?.metadata,
      sourceAgent: this.personalAgentId,
    });
  }

  async sendRoomMessage(
    roomId: string,
    utterance: string,
    options?: {
      messageType?: 'generic' | 'control' | 'room_state' | 'room_devices';
      metadata?: Record<string, unknown>;
    }
  ): Promise<ControlDispatchResult> {
    const roomAgentId = this.getAgentIdForRoom(roomId);
    if (!roomAgentId || !this.transport.isConnected()) {
      return {
        success: false,
        taskId: null,
        contextId: null,
        state: 'unknown',
        isTerminal: true,
        isInterrupted: false,
        detail: '消息通道尚未建立',
        action: null,
        raw: null,
      };
    }

    return this.transport.sendMessage({
      roomId,
      roomAgentId,
      utterance,
      messageType: options?.messageType ?? 'generic',
      metadata: options?.metadata,
      sourceAgent: this.personalAgentId,
    });
  }

  async subscribeToState(
    roomId: string,
    callback: (state: ControlTaskStateUpdate) => void
  ): Promise<boolean> {
    return this.transport.subscribeToState(roomId, callback, {
      roomAgentId: this.getAgentIdForRoom(roomId) ?? undefined,
    });
  }

  async subscribeToDescription(
    roomId: string,
    callback: (description: unknown) => void
  ): Promise<boolean> {
    return this.transport.subscribeToDescription(roomId, callback, {
      roomAgentId: this.getAgentIdForRoom(roomId) ?? undefined,
    });
  }

  setRoomAgent(roomId: string, agentId: string): void {
    this.roomAgents.set(roomId, agentId);
  }

  getAgentIdForRoom(roomId: string): string | null {
    return this.roomAgents.get(roomId) ?? roomId;
  }

  isConnected(): boolean {
    return this.transport.isConnected();
  }

  getLastError(): string | null {
    return this.transport.getLastError();
  }

  async destroy(): Promise<void> {
    this.roomAgents.clear();
    await this.transport.disconnect();
  }
}
