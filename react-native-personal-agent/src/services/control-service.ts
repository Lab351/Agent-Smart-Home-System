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
