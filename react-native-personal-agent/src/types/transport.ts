import type {
  AgentDiscoveryResult,
  ControlTaskAction,
  ControlTaskState,
  ControlTaskStateUpdate,
} from '@/types/domain';

export interface ControlCommand {
  roomId: string;
  roomAgentId: string;
  utterance: string;
  targetDevice: string;
  action: string;
  parameters?: Record<string, unknown>;
  taskId?: string | null;
  contextId?: string | null;
  metadata?: Record<string, unknown>;
  sourceAgent: string;
}

export interface ControlDispatchResult {
  success: boolean;
  taskId: string | null;
  contextId: string | null;
  state: ControlTaskState;
  isTerminal: boolean;
  isInterrupted: boolean;
  detail: string;
  action: ControlTaskAction | null;
  raw: unknown;
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
  getLastError(): string | null;
  sendControl(command: ControlCommand): Promise<ControlDispatchResult>;
  queryCapabilities(options: {
    roomId: string;
    roomAgentId: string;
    sourceAgent: string;
    agentInfo?: AgentDiscoveryResult | null;
  }): Promise<unknown>;
  subscribeToState(
    roomId: string,
    callback: (state: ControlTaskStateUpdate) => void,
    options?: { roomAgentId?: string }
  ): Promise<boolean>;
  subscribeToDescription(
    roomId: string,
    callback: (description: unknown) => void,
    options?: { roomAgentId?: string }
  ): Promise<boolean>;
}
