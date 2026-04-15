import type {
  AgentDiscoveryResult,
  ControlCommand,
  ControlDispatchResult,
  IControlTransport,
} from '@/types';

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

  getLastError(): string | null {
    return '控制通道未接入';
  }

  async sendControl(_command: ControlCommand): Promise<ControlDispatchResult> {
    return {
      success: false,
      taskId: null,
      contextId: null,
      state: 'unknown',
      isTerminal: true,
      isInterrupted: false,
      detail: '控制通道未接入',
      action: null,
      raw: null,
    };
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
