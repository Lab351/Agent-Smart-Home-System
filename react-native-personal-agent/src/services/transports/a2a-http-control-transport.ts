import type { AgentCard, Message, Part, Task } from '@a2a-js/sdk';
import type { Client } from '@a2a-js/sdk/client';

import type {
  AgentDiscoveryResult,
  ControlCommand,
  ControlTaskAction,
  ControlDispatchResult,
  ControlTaskState,
  ControlTaskStateUpdate,
  IControlTransport,
} from '@/types';

import { A2AClientAdapter, type IA2AClientAdapter } from './a2a-client-adapter';

type A2AHttpControlTransportOptions = {
  pollIntervalMs?: number;
  maxPollAttempts?: number;
};

const DEFAULT_POLL_INTERVAL_MS = 1_000;
const DEFAULT_MAX_POLL_ATTEMPTS = 15;
const ACCEPTED_OUTPUT_MODES = ['text', 'text/plain'];

export class A2AHttpControlTransport implements IControlTransport {
  private connected = false;
  private serviceBaseUrl: string | null = null;
  private agentCardUrl: string | null = null;
  private client: Client | null = null;
  private lastAgentInfo: AgentDiscoveryResult | null = null;
  private cachedDescription: unknown = null;
  private cachedState: ControlTaskStateUpdate | null = null;
  private lastError: string | null = null;
  private readonly descriptionCallbacks = new Set<(description: unknown) => void>();
  private readonly stateCallbacks = new Set<(state: ControlTaskStateUpdate) => void>();
  private activeTaskId: string | null = null;
  private activeTaskRoomId: string | null = null;
  private activePollToken = 0;
  private readonly pollIntervalMs: number;
  private readonly maxPollAttempts: number;

  constructor(
    private readonly adapter: IA2AClientAdapter = new A2AClientAdapter(),
    options: A2AHttpControlTransportOptions = {}
  ) {
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.maxPollAttempts = options.maxPollAttempts ?? DEFAULT_MAX_POLL_ATTEMPTS;
  }

  async connect(options: {
    personalAgentId: string;
    roomId?: string | null;
    roomAgentId?: string | null;
    agentInfo?: AgentDiscoveryResult | null;
  }): Promise<boolean> {
    const agentUrl = options.agentInfo?.url ?? null;
    if (!agentUrl) {
      this.connected = false;
      this.client = null;
      this.serviceBaseUrl = null;
      this.agentCardUrl = null;
      this.lastAgentInfo = null;
      this.cachedDescription = null;
      this.resetTaskTracking();
      this.lastError = 'discovery 未返回可用的 room-agent URL';
      return false;
    }

    try {
      const session = await this.adapter.createSession(agentUrl);

      this.client = session.client;
      this.serviceBaseUrl = session.serviceBaseUrl;
      this.agentCardUrl = session.agentCardUrl;
      this.lastAgentInfo = options.agentInfo ?? null;
      this.cachedDescription = this.mapAgentCardToDescription(session.agentCard, options);
      this.connected = true;
      this.resetTaskTracking();
      this.lastError = null;
      return true;
    } catch (error) {
      console.warn('[A2AHttpControlTransport] Failed to create A2A client session', error);
      this.connected = false;
      this.client = null;
      this.serviceBaseUrl = null;
      this.agentCardUrl = null;
      this.lastAgentInfo = null;
      this.cachedDescription = null;
      this.resetTaskTracking();
      this.lastError = `无法访问 room-agent agent-card: ${agentUrl}`;
      return false;
    }
  }

  disconnect(): void {
    this.connected = false;
    this.client = null;
    this.serviceBaseUrl = null;
    this.agentCardUrl = null;
    this.lastAgentInfo = null;
    this.cachedDescription = null;
    this.resetTaskTracking();
    this.lastError = null;
    this.descriptionCallbacks.clear();
    this.stateCallbacks.clear();
  }

  isConnected(): boolean {
    return this.connected;
  }

  getLastError(): string | null {
    return this.lastError;
  }

  async sendControl(command: ControlCommand): Promise<ControlDispatchResult> {
    if (!this.connected || !this.client) {
      this.lastError = '控制通道尚未建立';
      return {
        success: false,
        taskId: null,
        contextId: null,
        state: 'unknown',
        isTerminal: true,
        isInterrupted: false,
        detail: this.lastError,
        action: null,
        raw: null,
      };
    }

    try {
      const requestMetadata = {
        controlRequest: {
          roomId: command.roomId,
          roomAgentId: command.roomAgentId,
          sourceAgent: command.sourceAgent,
          targetDevice: command.targetDevice,
          action: command.action,
          parameters: command.parameters ?? {},
          ...(command.metadata ?? {}),
        },
      };

      const result = await this.adapter.sendMessage(this.client, {
        configuration: {
          acceptedOutputModes: ACCEPTED_OUTPUT_MODES,
          blocking: false,
          historyLength: 20,
        },
        message: {
          kind: 'message',
          messageId: this.generateId('msg'),
          role: 'user',
          contextId: command.contextId ?? undefined,
          taskId: command.taskId ?? undefined,
          metadata: requestMetadata,
          parts: [
            {
              kind: 'text',
              text: command.utterance,
              metadata: requestMetadata,
            },
          ],
        },
        metadata: requestMetadata,
      });

      const dispatch = this.resolveSendResult(result, command.roomId);
      this.lastError = dispatch.success ? null : dispatch.detail;
      return dispatch;
    } catch (error) {
      const detail = this.toErrorMessage(error, 'A2A 控制请求发送失败');
      this.lastError = detail;
      return {
        success: false,
        taskId: null,
        contextId: null,
        state: 'unknown',
        isTerminal: true,
        isInterrupted: false,
        detail,
        action: null,
        raw: error,
      };
    }
  }

  async queryCapabilities(options: {
    roomId: string;
    roomAgentId: string;
    sourceAgent: string;
    agentInfo?: AgentDiscoveryResult | null;
  }): Promise<unknown> {
    if (!this.connected || !this.client) {
      this.lastError = '控制通道尚未建立';
      return null;
    }

    const agentCard = await this.adapter.getAgentCard(this.client);
    const nextAgentInfo = options.agentInfo ?? this.lastAgentInfo;
    this.lastAgentInfo = nextAgentInfo ?? null;
    this.cachedDescription = this.mapAgentCardToDescription(agentCard, {
      ...options,
      agentInfo: nextAgentInfo,
    });
    this.lastError = null;

    this.descriptionCallbacks.forEach(callback => {
      callback(this.cachedDescription);
    });

    return this.cachedDescription;
  }

  async subscribeToState(
    roomId: string,
    callback: (state: ControlTaskStateUpdate) => void
  ): Promise<boolean> {
    this.stateCallbacks.add(callback);

    if (this.cachedState && this.cachedState.roomId === roomId) {
      callback(this.cachedState);
    }

    return this.activeTaskRoomId === roomId || this.cachedState?.roomId === roomId;
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

  private resolveSendResult(result: Message | Task, roomId: string): ControlDispatchResult {
    if (this.isMessage(result)) {
      const detail = this.extractMessageText(result.parts) || 'Room-Agent 已返回即时响应。';
      const update: ControlTaskStateUpdate = {
        taskId: this.extractTaskId(result),
        contextId: this.extractContextId(result),
        roomId,
        state: 'completed',
        success: true,
        isTerminal: true,
        isInterrupted: false,
        detail,
        action: null,
        raw: result,
      };
      this.emitStateUpdate(update);
      return {
        success: true,
        taskId: null,
        contextId: update.contextId,
        state: update.state,
        isTerminal: update.isTerminal,
        isInterrupted: update.isInterrupted,
        detail: update.detail,
        action: update.action,
        raw: result,
      };
    }

    const update = this.createTaskStateUpdate(result, roomId);
    this.emitStateUpdate(update);

    if (update.taskId && !this.shouldStopPolling(update)) {
      this.startTaskPolling(update.taskId, roomId);
    } else {
      this.resetTaskTracking();
    }

    return {
      success: update.success,
      taskId: update.taskId,
      contextId: update.contextId,
      state: update.state,
      isTerminal: update.isTerminal,
      isInterrupted: update.isInterrupted,
      detail: update.detail,
      action: update.action,
      raw: result,
    };
  }

  private generateId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  }

  private resetTaskTracking(): void {
    this.activePollToken += 1;
    this.activeTaskId = null;
    this.activeTaskRoomId = null;
    this.cachedState = null;
  }

  private startTaskPolling(taskId: string, roomId: string): void {
    this.activePollToken += 1;
    const pollToken = this.activePollToken;

    this.activeTaskId = taskId;
    this.activeTaskRoomId = roomId;

    void this.pollTaskUntilTerminal({
      pollToken,
      roomId,
      taskId,
    });
  }

  private async pollTaskUntilTerminal(options: {
    pollToken: number;
    roomId: string;
    taskId: string;
  }): Promise<void> {
    for (let attempt = 0; attempt < this.maxPollAttempts; attempt += 1) {
      if (!this.client || options.pollToken !== this.activePollToken) {
        return;
      }

      await this.sleep(this.pollIntervalMs);

      if (!this.client || options.pollToken !== this.activePollToken) {
        return;
      }

      try {
        const task = await this.adapter.getTask(this.client, options.taskId, 20);
        const update = this.createTaskStateUpdate(task, options.roomId);
        this.emitStateUpdate(update);

        if (this.shouldStopPolling(update)) {
          this.lastError = update.success ? null : update.detail;
          this.activeTaskId = null;
          this.activeTaskRoomId = null;
          return;
        }
      } catch (error) {
        if (attempt < this.maxPollAttempts - 1) {
          continue;
        }

        const update: ControlTaskStateUpdate = {
          taskId: options.taskId,
          contextId: null,
          roomId: options.roomId,
          state: 'unknown',
          success: false,
          isTerminal: true,
          isInterrupted: false,
          detail: this.toErrorMessage(error, 'Room-Agent 任务状态查询超时或失败'),
          action: null,
          raw: error,
        };
        this.emitStateUpdate(update);
        this.lastError = update.detail;
        this.activeTaskId = null;
        this.activeTaskRoomId = null;
      }
    }
  }

  private emitStateUpdate(update: ControlTaskStateUpdate): void {
    this.cachedState = update;

    this.stateCallbacks.forEach(callback => {
      callback(update);
    });
  }

  private isMessage(result: Message | Task): result is Message {
    return result.kind === 'message';
  }

  private createTaskStateUpdate(task: Task, roomId: string): ControlTaskStateUpdate {
    const state = this.normalizeTaskState(task.status?.state);
    const detail = this.extractTaskDetail(task, state);
    const isInterrupted = this.isInterruptedState(state);
    const action = this.extractTaskAction(task, state, detail);

    return {
      taskId: typeof task.id === 'string' ? task.id : null,
      contextId: this.extractContextId(task),
      roomId,
      state,
      success: !this.isFailedState(state),
      isTerminal: this.isTerminalState(state),
      isInterrupted,
      detail,
      action,
      raw: task,
    };
  }

  private normalizeTaskState(state: string | undefined): ControlTaskState {
    switch (state) {
      case 'submitted':
      case 'working':
      case 'input-required':
      case 'auth-required':
      case 'completed':
      case 'failed':
      case 'canceled':
      case 'rejected':
        return state;
      default:
        return 'unknown';
    }
  }

  private extractTaskId(result: Message | Task): string | null {
    return 'taskId' in result && typeof result.taskId === 'string'
      ? result.taskId
      : 'id' in result && typeof result.id === 'string'
        ? result.id
        : null;
  }

  private extractContextId(result: Message | Task): string | null {
    return 'contextId' in result && typeof result.contextId === 'string' ? result.contextId : null;
  }

  private isFailedState(state: ControlTaskState): boolean {
    return state === 'failed' || state === 'canceled' || state === 'rejected' || state === 'unknown';
  }

  private isTerminalState(state: ControlTaskState): boolean {
    return (
      state === 'completed' ||
      state === 'failed' ||
      state === 'canceled' ||
      state === 'rejected' ||
      state === 'unknown'
    );
  }

  private isInterruptedState(state: ControlTaskState): boolean {
    return state === 'input-required' || state === 'auth-required';
  }

  private shouldStopPolling(update: ControlTaskStateUpdate): boolean {
    return update.isTerminal || update.isInterrupted;
  }

  private extractTaskDetail(task: Task, state: ControlTaskState): string {
    const fromStatus = this.extractMessageText(task.status?.message?.parts);
    if (fromStatus) {
      return fromStatus;
    }

    const artifacts = Array.isArray(task.artifacts) ? task.artifacts : [];
    for (let index = artifacts.length - 1; index >= 0; index -= 1) {
      const text = this.extractMessageText(artifacts[index]?.parts);
      if (text) {
        return text;
      }
    }

    switch (state) {
      case 'submitted':
        return 'Room-Agent 已接收控制请求，等待开始执行。';
      case 'working':
        return 'Room-Agent 正在执行控制任务。';
      case 'input-required':
        return 'Room-Agent 需要补充输入后才能继续执行。';
      case 'auth-required':
        return 'Room-Agent 需要额外鉴权后才能继续执行。';
      case 'completed':
        return 'Room-Agent 已完成本次控制任务。';
      case 'failed':
        return 'Room-Agent 返回失败状态，请检查后端执行日志。';
      case 'canceled':
        return 'Room-Agent 已取消当前控制任务。';
      case 'rejected':
        return 'Room-Agent 拒绝执行当前控制任务。';
      default:
        return '暂时无法确认 Room-Agent 的最终执行状态。';
    }
  }

  private extractMessageText(parts: Part[] | unknown[] | undefined): string {
    if (!Array.isArray(parts)) {
      return '';
    }

    const chunks = parts
      .map(part => {
        if (!part || typeof part !== 'object') {
          return '';
        }

        if ('kind' in part && part.kind === 'text' && 'text' in part && typeof part.text === 'string') {
          return part.text.trim();
        }

        if (
          'root' in part &&
          part.root &&
          typeof part.root === 'object' &&
          'text' in part.root &&
          typeof part.root.text === 'string'
        ) {
          return part.root.text.trim();
        }

        return '';
      })
      .filter(Boolean);

    return chunks.join('\n');
  }

  private toErrorMessage(error: unknown, fallback: string): string {
    return error instanceof Error ? `${fallback}: ${error.message}` : fallback;
  }

  private extractTaskAction(
    task: Task,
    state: ControlTaskState,
    detail: string
  ): ControlTaskAction | null {
    if (!this.isInterruptedState(state)) {
      return null;
    }

    const requirementKind = state === 'auth-required' ? 'auth' : 'input';
    const action = this.collectTaskActionCandidates(task)
      .map(candidate => this.toTaskAction(candidate, requirementKind))
      .find(Boolean);
    const fallbackUrl = this.extractUrlFromText(detail);

    if (!action && !fallbackUrl) {
      return {
        kind: requirementKind,
        label: requirementKind === 'auth' ? '完成鉴权后继续' : '补充信息后继续',
        description: detail,
        url: null,
        callbackUrl: null,
      };
    }

    return {
      kind: requirementKind,
      label:
        action?.label ??
        (requirementKind === 'auth' ? '打开鉴权页面' : '查看补充要求'),
      description: action?.description ?? detail,
      url: action?.url ?? fallbackUrl,
      callbackUrl: action?.callbackUrl ?? null,
    };
  }

  private collectTaskActionCandidates(task: Task): Record<string, unknown>[] {
    const candidates: Record<string, unknown>[] = [];

    const append = (value: unknown) => {
      const record = this.asRecord(value);
      if (record) {
        candidates.push(record);
      }
    };

    append(task);
    append(task.status);
    append(task.status?.message);

    for (const part of task.status?.message?.parts ?? []) {
      append(part);
      append(this.asRecord(part)?.metadata);
      append(this.asRecord(part)?.root);
      append(this.asRecord(this.asRecord(part)?.root)?.metadata);
      append(this.asRecord(part)?.data);
    }

    for (const artifact of task.artifacts ?? []) {
      append(artifact);
      for (const part of artifact.parts ?? []) {
        append(part);
        append(this.asRecord(part)?.metadata);
        append(this.asRecord(part)?.data);
      }
    }

    return candidates;
  }

  private toTaskAction(
    candidate: Record<string, unknown>,
    requirementKind: ControlTaskAction['kind']
  ): ControlTaskAction | null {
    const nestedCandidates = [
      candidate,
      this.asRecord(candidate.actionRequired),
      this.asRecord(candidate.action_requirement),
      this.asRecord(candidate.action),
      this.asRecord(candidate.auth),
      this.asRecord(candidate.authentication),
      this.asRecord(candidate.authorization),
      this.asRecord(candidate.requirement),
      this.asRecord(candidate.taskAction),
      this.asRecord(candidate.task_action),
    ].filter((item): item is Record<string, unknown> => Boolean(item));

    for (const item of nestedCandidates) {
      const url = this.pickFirstString(item, [
        'url',
        'href',
        'authUrl',
        'auth_url',
        'authorizationUrl',
        'authorization_url',
        'verificationUrl',
        'verification_url',
        'openUrl',
        'open_url',
        'deepLink',
        'deep_link',
      ]);
      const callbackUrl = this.pickFirstString(item, [
        'callbackUrl',
        'callback_url',
        'redirectUrl',
        'redirect_url',
        'returnTo',
        'continueUrl',
        'continue_url',
      ]);
      const description = this.pickFirstString(item, [
        'description',
        'detail',
        'message',
        'instructions',
        'instruction',
        'prompt',
      ]);
      const label = this.pickFirstString(item, [
        'label',
        'ctaLabel',
        'actionLabel',
        'buttonLabel',
        'buttonText',
      ]);
      const inferredUrl = url ?? this.extractUrlFromText(description);

      if (!description && !label && !inferredUrl && !callbackUrl) {
        continue;
      }

      return {
        kind: requirementKind,
        label: label ?? null,
        description: description ?? null,
        url: inferredUrl,
        callbackUrl: callbackUrl ?? null,
      };
    }

    return null;
  }

  private pickFirstString(record: Record<string, unknown>, keys: string[]): string | null {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
    }

    return null;
  }

  private extractUrlFromText(value: string | null | undefined): string | null {
    if (!value) {
      return null;
    }

    const matched = value.match(/((https?:\/\/|[a-z][a-z0-9+.-]*:\/\/)[^\s]+)/i);
    return matched ? matched[1] : null;
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private mapAgentCardToDescription(
    response: AgentCard,
    options: {
      roomId?: string | null;
      roomAgentId?: string | null;
      roomName?: string | null;
      agentInfo?: AgentDiscoveryResult | null;
    }
  ) {
    const metadataCandidate = (response as { metadata?: unknown }).metadata;
    const metadata =
      metadataCandidate && typeof metadataCandidate === 'object'
        ? (metadataCandidate as Record<string, unknown>)
        : undefined;
    const responseDevices = Array.isArray((response as { devices?: unknown }).devices)
      ? ((response as { devices?: unknown[] }).devices ?? [])
      : null;

    const capabilitySet = new Set<string>();

    if (response.capabilities?.streaming) {
      capabilitySet.add('streaming');
    }
    if (response.capabilities?.pushNotifications) {
      capabilitySet.add('push-notifications');
    }
    if (response.capabilities?.stateTransitionHistory) {
      capabilitySet.add('state-transition-history');
    }

    for (const skill of response.skills ?? []) {
      if (skill.id) {
        capabilitySet.add(skill.id);
      }
      for (const tag of skill.tags ?? []) {
        capabilitySet.add(tag);
      }
    }

    for (const capability of options.agentInfo?.capabilities ?? []) {
      capabilitySet.add(capability);
    }

    return {
      room_id: options.roomId ?? options.agentInfo?.roomId ?? null,
      room_name: options.roomName ?? options.agentInfo?.roomName ?? null,
      agent_id:
        (response as { id?: unknown }).id ??
        options.roomAgentId ??
        options.agentInfo?.agentId ??
        null,
      agent_name: response.name ?? null,
      agent_type:
        typeof metadata?.agent_type === 'string'
          ? metadata.agent_type
          : 'room',
      agent_description: response.description ?? null,
      agent_version: response.version ?? null,
      devices: responseDevices ?? options.agentInfo?.devices ?? [],
      capabilities: Array.from(capabilitySet),
      skills: response.skills ?? [],
      raw_agent_card: response,
    };
  }
}
