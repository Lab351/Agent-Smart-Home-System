import type { AgentDiscoveryResult } from '@/types/domain';

export interface ControlCommand {
  roomId: string;
  roomAgentId: string;
  targetDevice: string;
  action: string;
  parameters?: Record<string, unknown>;
  sourceAgent: string;
}

export interface IControlTransport {
  connect(options: {
    personalAgentId: string;
    roomId?: string | null;
    roomAgentId?: string | null;
    agentInfo?: AgentDiscoveryResult | null;
  }): Promise<boolean>;
  disconnect(): void | Promise<void>;
  isConnected(): boolean;
  sendControl(command: ControlCommand): Promise<boolean>;
  queryCapabilities(options: {
    roomId: string;
    roomAgentId: string;
    sourceAgent: string;
    agentInfo?: AgentDiscoveryResult | null;
  }): Promise<unknown>;
  subscribeToState(
    roomId: string,
    callback: (state: unknown) => void,
    options?: { roomAgentId?: string }
  ): Promise<boolean>;
  subscribeToDescription(
    roomId: string,
    callback: (description: unknown) => void,
    options?: { roomAgentId?: string }
  ): Promise<boolean>;
}
