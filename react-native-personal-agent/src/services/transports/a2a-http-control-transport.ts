import { HttpClient } from '@/platform';
import type { AgentDiscoveryResult, ControlCommand, IControlTransport } from '@/types';

type JsonRpcResponse = {
  result?: {
    kind?: string;
    status?: {
      state?: string;
    };
  };
  error?: unknown;
};

export class A2AHttpControlTransport implements IControlTransport {
  private connected = false;
  private agentUrl: string | null = null;
  private agentCardUrl: string | null = null;
  private cachedDescription: unknown = null;
  private readonly descriptionCallbacks = new Set<(description: unknown) => void>();

  constructor(private readonly http = new HttpClient()) {}

  async connect(options: {
    personalAgentId: string;
    roomId?: string | null;
    roomAgentId?: string | null;
    agentInfo?: AgentDiscoveryResult | null;
  }): Promise<boolean> {
    const agentUrl = options.agentInfo?.url ?? null;
    if (!agentUrl) {
      this.connected = false;
      return false;
    }

    this.agentUrl = agentUrl;
    this.agentCardUrl = this.buildAgentCardUrl(agentUrl);
    this.connected = true;
    return true;
  }

  disconnect(): void {
    this.connected = false;
    this.agentUrl = null;
    this.agentCardUrl = null;
    this.cachedDescription = null;
    this.descriptionCallbacks.clear();
  }

  isConnected(): boolean {
    return this.connected;
  }

  async sendControl(command: ControlCommand): Promise<boolean> {
    if (!this.connected || !this.agentUrl) {
      return false;
    }

    const response = await this.http.post<JsonRpcResponse>(this.agentUrl, {
      jsonrpc: '2.0',
      id: this.generateId('rpc'),
      method: 'message/send',
      params: {
        message: {
          kind: 'message',
          messageId: this.generateId('msg'),
          role: 'user',
          parts: [
            {
              kind: 'data',
              data: {
                kind: 'control_request',
                roomId: command.roomId,
                roomAgentId: command.roomAgentId,
                sourceAgent: command.sourceAgent,
                targetDevice: command.targetDevice,
                action: command.action,
                parameters: command.parameters ?? {},
                requestId: this.generateId('request'),
                timestamp: new Date().toISOString(),
              },
            },
          ],
        },
      },
    });

    return this.resolveSendResult(response);
  }

  async queryCapabilities(options: {
    roomId: string;
    roomAgentId: string;
    sourceAgent: string;
    agentInfo?: AgentDiscoveryResult | null;
  }): Promise<unknown> {
    if (!this.connected || !this.agentCardUrl) {
      return null;
    }

    const response = await this.http.get<Record<string, unknown>>(this.agentCardUrl);
    this.cachedDescription = {
      agent_id: response.id ?? options.roomAgentId,
      agent_type:
        typeof response.agent_type === 'string'
          ? response.agent_type
          : ((response.metadata as Record<string, unknown> | undefined)?.agent_type ?? 'room'),
      devices: Array.isArray(response.devices) ? response.devices : [],
      capabilities: Array.isArray(response.capabilities) ? response.capabilities : [],
      raw_agent_card: response,
    };

    this.descriptionCallbacks.forEach(callback => {
      callback(this.cachedDescription);
    });

    return this.cachedDescription;
  }

  async subscribeToState(): Promise<boolean> {
    return false;
  }

  async subscribeToDescription(
    _roomId: string,
    callback: (description: unknown) => void
  ): Promise<boolean> {
    this.descriptionCallbacks.add(callback);

    if (this.cachedDescription) {
      callback(this.cachedDescription);
    }

    return true;
  }

  private buildAgentCardUrl(agentUrl: string): string {
    const matched = /^https?:\/\/[^/]+/.exec(agentUrl);
    if (!matched) {
      throw new Error(`Invalid A2A agent url: ${agentUrl}`);
    }

    return `${matched[0]}/.well-known/agent-card.json`;
  }

  private resolveSendResult(response: JsonRpcResponse): boolean {
    if (response.error) {
      return false;
    }

    if (response.result?.kind === 'message') {
      return true;
    }

    return response.result?.status?.state === 'completed';
  }

  private generateId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  }
}
