import type { AgentDiscoveryResult, ControlCommand, IControlTransport } from '@/types';

export class UnavailableControlTransport implements IControlTransport {
  async connect(_options: {
    personalAgentId: string;
    roomId?: string | null;
    roomAgentId?: string | null;
    agentInfo?: AgentDiscoveryResult | null;
  }): Promise<boolean> {
    return false;
  }

  disconnect(): void {}

  isConnected(): boolean {
    return false;
  }

  async sendControl(_command: ControlCommand): Promise<boolean> {
    return false;
  }

  async queryCapabilities(): Promise<unknown> {
    return null;
  }

  async subscribeToState(): Promise<boolean> {
    return false;
  }

  async subscribeToDescription(): Promise<boolean> {
    return false;
  }
}
