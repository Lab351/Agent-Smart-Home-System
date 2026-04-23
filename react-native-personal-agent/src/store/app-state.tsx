import {
  useCallback,
  createContext,
  startTransition,
  useContext,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import * as Linking from 'expo-linking';

import {
  AsrService,
  A2AHttpControlTransport,
  ControlService,
  BeaconBindingCoordinator,
  DiscoveryService,
  ExecutionHistoryService,
  HomeAgentService,
  InterruptedTaskRecoveryService,
  IntentService,
  TaskActionLauncherService,
  UserPreferenceService,
  VoiceCommandOrchestrator,
} from '@/services';
import { appEnv } from '@/config/env';
import {
  BleBeaconService,
  ExpoAudioRecordService,
} from '@/platform';
import type {
  AudioRecordingResult,
  AudioRecorderSnapshot,
  BeaconScanDiagnostic,
  BeaconScanIssue,
  BeaconScanResult,
  ConnectionStatus,
  ControlTaskStateUpdate,
  PermissionSnapshot,
  RoomAgentSnapshot,
  RoomBinding,
  AgentDiscoveryResult,
  TaskActionCallbackResult,
  UserPreferences,
  VoiceCommandExecutionResult,
} from '@/types';
import {
  mergeRecoveredExecutionIntoHistory,
  prependExecutionHistory,
} from '@/features/voice-control/execution-history';
import { buildRoomAgentSnapshot } from '@/features/voice-control/room-agent-snapshot';
import {
  buildTaskContinuationMetadata,
  describeTaskActionCallback,
  resolveTaskActionCallbackFromUrl,
} from '@/features/voice-control/task-action-callback';
import {
  buildRoomTaskDispatchPresentation,
  canContinueInterruptedRoomTask,
  finalizeExecutionWithoutTaskTracking,
  mapTaskStateToStatus,
  mergeExecutionState,
  shouldTrackRoomTaskResult,
  TASK_TRACKING_UNAVAILABLE_DETAIL,
  TASK_TRACKING_UNAVAILABLE_STATUS,
} from '@/features/voice-control/task-state';
import { buildBeaconScanIssue } from '@/features/room-binding/scan-feedback';

type AppStateValue = {
  currentRoomBinding: RoomBinding | null;
  discoveredBeacons: BeaconScanResult[];
  beaconDiagnostics: BeaconScanDiagnostic[];
  beaconScanIssue: BeaconScanIssue | null;
  isScanningBeacon: boolean;
  isStartingBeaconScan: boolean;
  controlStatus: ConnectionStatus;
  microphonePermission: PermissionSnapshot | null;
  bluetoothPermission: PermissionSnapshot | null;
  recorderState: AudioRecorderSnapshot | null;
  lastRecording: AudioRecordingResult | null;
  voiceStatusText: string;
  transcript: string;
  responsePreview: string;
  isRecognizingSpeech: boolean;
  preferences: UserPreferences | null;
  commandDraft: string;
  taskFollowUpDraft: string;
  isExecutingCommand: boolean;
  isAwaitingCommandResult: boolean;
  lastCommandExecution: VoiceCommandExecutionResult | null;
  isRecoveredInterruptedTask: boolean;
  recoveredInterruptedTaskAt: number | null;
  commandExecutionHistory: VoiceCommandExecutionResult[];
  roomAgentSnapshot: RoomAgentSnapshot | null;
  latestTaskActionCallback: TaskActionCallbackResult | null;
  toggleBeaconScanning: () => Promise<void>;
  unbindRoom: () => Promise<void>;
  toggleRecording: () => Promise<void>;
  reloadPreferences: () => Promise<void>;
  updateCommandDraft: (value: string) => void;
  updateTaskFollowUpDraft: (value: string) => void;
  submitCommandDraft: () => Promise<void>;
  submitTaskFollowUp: () => Promise<void>;
  openCurrentTaskAction: () => Promise<void>;
};

const AppStateContext = createContext<AppStateValue | null>(null);

function resolveDescriptionRoomId(description: unknown): string | null {
  if (!description || typeof description !== 'object') {
    return null;
  }

  const roomId = (description as { room_id?: unknown }).room_id;
  return typeof roomId === 'string' && roomId.trim().length > 0 ? roomId.trim() : null;
}

function mergeBeaconResult(
  previousResults: BeaconScanResult[],
  nextResult: BeaconScanResult
): BeaconScanResult[] {
  const deduped = previousResults.filter(item => item.deviceId !== nextResult.deviceId);
  const nextResults = [nextResult, ...deduped];
  return nextResults
    .sort((left, right) => right.rssi - left.rssi)
    .slice(0, 8);
}

function mergeBeaconDiagnostic(
  previousDiagnostics: BeaconScanDiagnostic[],
  nextDiagnostic: BeaconScanDiagnostic
): BeaconScanDiagnostic[] {
  const deduped = previousDiagnostics.filter(
    item =>
      !(
        item.deviceId === nextDiagnostic.deviceId &&
        item.reason === nextDiagnostic.reason &&
        item.major === nextDiagnostic.major
      )
  );

  return [nextDiagnostic, ...deduped]
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, 3);
}

function buildTaskFollowUpDraft(result: VoiceCommandExecutionResult | null): string {
  if (result?.taskState === 'auth-required') {
    return '我已完成鉴权，请继续执行。';
  }

  return '';
}

function buildTaskFollowUpDraftForState(state: ControlTaskStateUpdate['state']): string {
  return state === 'auth-required' ? '我已完成鉴权，请继续执行。' : '';
}

function buildRoomAgentConnectionDetail(options: {
  roomId: string;
  agentInfo?: AgentDiscoveryResult | null;
  error?: string | null;
}): string {
  const parts = [`roomId=${options.roomId}`];

  if (options.agentInfo?.agentId) {
    parts.push(`agentId=${options.agentInfo.agentId}`);
  }
  if (options.agentInfo?.url) {
    parts.push(`url=${options.agentInfo.url}`);
  }
  if (options.error) {
    parts.push(options.error);
  }

  return parts.join('；');
}

export function AppStateProvider({ children }: PropsWithChildren) {
  const bleBeaconService = useRef(new BleBeaconService()).current;
  const audioRecordService = useRef(new ExpoAudioRecordService()).current;
  const asrService = useRef(new AsrService()).current;
  const executionHistoryService = useRef(new ExecutionHistoryService()).current;
  const preferenceService = useRef(new UserPreferenceService()).current;
  const interruptedTaskRecoveryService = useRef(new InterruptedTaskRecoveryService()).current;
  const taskActionLauncherService = useRef(new TaskActionLauncherService()).current;
  const beaconBindingCoordinator = useRef(new BeaconBindingCoordinator(bleBeaconService)).current;
  const intentService = useRef(new IntentService()).current;
  const discoveryService = useRef(new DiscoveryService()).current;
  const controlService = useRef(
    new ControlService(appEnv.personalAgentId, new A2AHttpControlTransport())
  ).current;
  const homeAgentService = useRef(new HomeAgentService()).current;
  const voiceCommandOrchestrator = useRef(
    new VoiceCommandOrchestrator(intentService, discoveryService, controlService, homeAgentService)
  ).current;

  const [currentRoomBinding, setCurrentRoomBinding] = useState<RoomBinding | null>(null);
  const [discoveredBeacons, setDiscoveredBeacons] = useState<BeaconScanResult[]>([]);
  const [isScanningBeacon, setIsScanningBeacon] = useState(false);
  const [beaconDiagnostics, setBeaconDiagnostics] = useState<BeaconScanDiagnostic[]>([]);
  const [beaconScanIssue, setBeaconScanIssue] = useState<BeaconScanIssue | null>(null);
  const [isStartingBeaconScan, setIsStartingBeaconScan] = useState(false);
  const [controlStatus, setControlStatus] = useState<ConnectionStatus>('disconnected');
  const [microphonePermission, setMicrophonePermission] = useState<PermissionSnapshot | null>(null);
  const [bluetoothPermission, setBluetoothPermission] = useState<PermissionSnapshot | null>(null);
  const [recorderState, setRecorderState] = useState<AudioRecorderSnapshot | null>(null);
  const [lastRecording, setLastRecording] = useState<AudioRecordingResult | null>(null);
  const [voiceStatusText, setVoiceStatusText] = useState('点击麦克风开始录音');
  const [transcript, setTranscript] = useState('等待录音输入');
  const [responsePreview, setResponsePreview] = useState('待接入 room-agent / home-agent 执行结果');
  const [isRecognizingSpeech, setIsRecognizingSpeech] = useState(false);
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [commandDraft, setCommandDraft] = useState('打开客厅主灯亮度调到80');
  const [taskFollowUpDraft, setTaskFollowUpDraft] = useState('');
  const [isExecutingCommand, setIsExecutingCommand] = useState(false);
  const [isAwaitingCommandResult, setIsAwaitingCommandResult] = useState(false);
  const [lastCommandExecution, setLastCommandExecution] = useState<VoiceCommandExecutionResult | null>(
    null
  );
  const [isRecoveredInterruptedTask, setIsRecoveredInterruptedTask] = useState(false);
  const [recoveredInterruptedTaskAt, setRecoveredInterruptedTaskAt] = useState<number | null>(null);
  const [commandExecutionHistory, setCommandExecutionHistory] = useState<
    VoiceCommandExecutionResult[]
  >([]);
  const [roomAgentSnapshot, setRoomAgentSnapshot] = useState<RoomAgentSnapshot | null>(null);
  const [latestTaskActionCallback, setLatestTaskActionCallback] =
    useState<TaskActionCallbackResult | null>(null);
  const activeRoomTaskIdRef = useRef<string | null>(null);
  const recoveryHydratedRef = useRef(false);
  const initialTaskActionCallbackCheckedRef = useRef(false);
  const handledTaskActionCallbackUrlRef = useRef<string | null>(null);
  const autoConnectTokenRef = useRef(0);
  const lastAutoConnectBindingKeyRef = useRef<string | null>(null);
  const activeRoomSnapshotRef = useRef<{ roomId: string | null; roomName: string | null }>({
    roomId: null,
    roomName: null,
  });
  const currentRoomAutoConnectKey = currentRoomBinding
    ? `${currentRoomBinding.roomId}:${currentRoomBinding.beaconId ?? ''}`
    : null;

  const handleScanResult = useEffectEvent((result: BeaconScanResult) => {
    startTransition(() => {
      setDiscoveredBeacons(previous => mergeBeaconResult(previous, result));
    });
  });

  const handleScanDiagnostic = useEffectEvent((diagnostic: BeaconScanDiagnostic) => {
    startTransition(() => {
      setBeaconDiagnostics(previous => mergeBeaconDiagnostic(previous, diagnostic));
    });
  });

  const handleBindingUpdate = useEffectEvent((binding: RoomBinding | null) => {
    startTransition(() => {
      setCurrentRoomBinding(binding);
    });

    const preserveInterruptedTask = canContinueInterruptedRoomTask(lastCommandExecution);
    const previousRoomId = activeRoomSnapshotRef.current.roomId;
    const nextRoomId = binding?.roomId ?? null;
    const nextRoomName = binding?.roomName ?? null;
    const roomChanged = previousRoomId !== nextRoomId;

    activeRoomSnapshotRef.current = {
      roomId: nextRoomId,
      roomName: nextRoomName,
    };

    if (roomChanged) {
      activeRoomTaskIdRef.current = null;
      autoConnectTokenRef.current += 1;
      setIsAwaitingCommandResult(false);
      if (!preserveInterruptedTask) {
        setTaskFollowUpDraft('');
      }
      setRoomAgentSnapshot(null);
      setControlStatus('disconnected');
    }

    if (previousRoomId && roomChanged) {
      if (preserveInterruptedTask) {
        setVoiceStatusText('房间上下文已切换，待继续任务已保留');
        setResponsePreview('继续任务时会自动重新连接原来的 Room-Agent。');
      } else {
        setVoiceStatusText(`房间上下文已切换到${nextRoomName ?? nextRoomId ?? '新房间'}`);
        setResponsePreview('等待新的 Room-Agent 描述快照和控制结果。');
      }
    }
  });

  const handleRoomAgentDescription = useEffectEvent((description: unknown) => {
    const descriptionRoomId = resolveDescriptionRoomId(description);
    if (descriptionRoomId && descriptionRoomId !== activeRoomSnapshotRef.current.roomId) {
      return;
    }

    const snapshot = buildRoomAgentSnapshot(description, {
      roomId: activeRoomSnapshotRef.current.roomId,
      roomName: activeRoomSnapshotRef.current.roomName,
    });
    setRoomAgentSnapshot(snapshot);
  });

  const handleRoomTaskStateUpdate = useEffectEvent((update: ControlTaskStateUpdate) => {
    if (!update.taskId || update.taskId !== activeRoomTaskIdRef.current) {
      return;
    }

    const nextStatus = mapTaskStateToStatus(update.state);
    setVoiceStatusText(nextStatus);
    setResponsePreview(update.detail);
    setControlStatus(
      update.success ? (update.isTerminal || update.isInterrupted ? 'connected' : 'connecting') : 'error'
    );
    setLastCommandExecution(previous => {
      if (!previous || previous.taskId !== update.taskId) {
        return previous;
      }

      return mergeExecutionState(previous, update);
    });
    setCommandExecutionHistory(previous =>
      previous.map(item => (item.taskId === update.taskId ? mergeExecutionState(item, update) : item))
    );

    if (update.isTerminal || update.isInterrupted) {
      activeRoomTaskIdRef.current = null;
      setIsAwaitingCommandResult(false);
    }

    if (update.isInterrupted) {
      setTaskFollowUpDraft(previous =>
        previous.trim().length > 0 ? previous : buildTaskFollowUpDraftForState(update.state)
      );
    }

    if (update.isTerminal) {
      setTaskFollowUpDraft('');
      setLatestTaskActionCallback(null);
      handledTaskActionCallbackUrlRef.current = null;
      setIsRecoveredInterruptedTask(false);
      setRecoveredInterruptedTaskAt(null);
    }
  });

  const handleTaskActionCallbackUrl = useEffectEvent((
    url: string,
    source: 'initial' | 'event'
  ) => {
    if (!canContinueInterruptedRoomTask(lastCommandExecution)) {
      return;
    }

    const callback = resolveTaskActionCallbackFromUrl({
      url,
      expectedCallbackUrl: lastCommandExecution.taskAction?.callbackUrl ?? null,
    });
    if (!callback || handledTaskActionCallbackUrlRef.current === callback.rawUrl) {
      return;
    }

    handledTaskActionCallbackUrlRef.current = callback.rawUrl;
    setLatestTaskActionCallback(callback);
    setControlStatus('connected');
    setVoiceStatusText('已收到页面回跳，可以继续当前任务');
    setResponsePreview(
      lastCommandExecution.taskAction?.kind === 'auth'
        ? `${describeTaskActionCallback(callback)} ${
            source === 'initial' ? '应用启动时已恢复回跳信息，' : ''
          }请确认状态后点击“继续任务”。`
        : `${describeTaskActionCallback(callback)} ${
            source === 'initial' ? '应用启动时已恢复回跳信息，' : ''
          }请确认内容后点击“继续任务”。`
    );
  });

  const ensureConnectedForInterruptedTask = useEffectEvent(
    async (execution: VoiceCommandExecutionResult): Promise<boolean> => {
      if (!execution.roomId) {
        setVoiceStatusText('缺少继续任务所需的房间信息');
        setResponsePreview('当前任务未保存 roomId，无法重新连接目标 Room-Agent。');
        setControlStatus('error');
        return false;
      }

      if (
        controlService.isConnected() &&
        activeRoomSnapshotRef.current.roomId === execution.roomId
      ) {
        return true;
      }

      setVoiceStatusText('正在恢复中断任务上下文...');
      setResponsePreview('已找到待继续任务，正在重新发现并连接目标 Room-Agent。');
      setControlStatus('connecting');

      const agentInfo = await discoveryService.getRoomAgentByRoomId(execution.roomId);
      if (!agentInfo) {
        setVoiceStatusText('无法恢复 Room-Agent 连接');
        setResponsePreview(`没有找到房间 ${execution.roomId} 的代理映射，当前无法继续任务。`);
        setControlStatus('error');
        return false;
      }

      controlService.setRoomAgent(agentInfo.roomId, agentInfo.agentId);
      const connected = await controlService.connect(agentInfo, agentInfo.roomId);
      if (!connected) {
        const connectionError = controlService.getLastError();
        setVoiceStatusText('Room-Agent 重连失败');
        setResponsePreview(
          connectionError
            ? `已找到目标代理，但重连失败。${connectionError}`
            : '已找到目标代理，但 Room-Agent 重连失败。'
        );
        setControlStatus('error');
        return false;
      }

      activeRoomSnapshotRef.current = {
        roomId: agentInfo.roomId,
        roomName: agentInfo.roomName,
      };

      await controlService.subscribeToDescription(agentInfo.roomId, handleRoomAgentDescription);
      try {
        await controlService.queryCapabilities(agentInfo.roomId, agentInfo);
      } catch (error) {
        console.warn('[AppState] Failed to refresh room-agent description during recovery', error);
      }

      setControlStatus('connected');
      return true;
    }
  );

  const connectCurrentRoomAgent = useEffectEvent(async (binding: RoomBinding): Promise<void> => {
    const token = ++autoConnectTokenRef.current;

    activeRoomSnapshotRef.current = {
      roomId: binding.roomId,
      roomName: binding.roomName,
    };
    setControlStatus('connecting');
    setVoiceStatusText(`正在连接${binding.roomName ?? binding.roomId}的 Room-Agent...`);
    setResponsePreview(
      `已绑定房间 ${binding.roomId}，正在通过 discovery 查询 Room-Agent 并探活 agent-card。`
    );

    const isCurrentRequest = () =>
      autoConnectTokenRef.current === token &&
      activeRoomSnapshotRef.current.roomId === binding.roomId;

    const agentInfo = await discoveryService.getRoomAgentByRoomId(binding.roomId);
    if (!isCurrentRequest()) {
      return;
    }

    if (!agentInfo) {
      setControlStatus('error');
      setVoiceStatusText('未发现 Room-Agent');
      setResponsePreview(
        `已绑定房间，但 discovery 未返回可用代理。${buildRoomAgentConnectionDetail({
          roomId: binding.roomId,
        })}`
      );
      return;
    }

    controlService.setRoomAgent(agentInfo.roomId, agentInfo.agentId);
    const connected = await controlService.connect(agentInfo, agentInfo.roomId);
    if (!isCurrentRequest()) {
      return;
    }

    if (!connected) {
      const connectionError = controlService.getLastError();
      setControlStatus('error');
      setVoiceStatusText('Room-Agent 自动连接失败');
      setResponsePreview(
        `已发现目标代理，但 A2A 控制通道未连通。${buildRoomAgentConnectionDetail({
          roomId: agentInfo.roomId,
          agentInfo,
          error: connectionError,
        })}`
      );
      return;
    }

    activeRoomSnapshotRef.current = {
      roomId: agentInfo.roomId,
      roomName: agentInfo.roomName,
    };

    await controlService.subscribeToDescription(agentInfo.roomId, handleRoomAgentDescription);
    if (!isCurrentRequest()) {
      return;
    }

    try {
      await controlService.queryCapabilities(agentInfo.roomId, agentInfo);
    } catch (error) {
      console.warn('[AppState] Failed to refresh room-agent description after auto-connect', error);
    }

    if (!isCurrentRequest()) {
      return;
    }

    setControlStatus('connected');
    setVoiceStatusText('Room-Agent 控制通道已连接');
    setResponsePreview(
      `已连接 ${agentInfo.roomName ?? agentInfo.roomId} 的 Room-Agent。${buildRoomAgentConnectionDetail({
        roomId: agentInfo.roomId,
        agentInfo,
      })}`
    );
  });

  const executeVoiceCommand = useCallback(async (input: string, source: 'text' | 'voice') => {
    const normalizedInput = input.trim();
    setIsExecutingCommand(true);
    setIsAwaitingCommandResult(false);
    setIsRecoveredInterruptedTask(false);
    setRecoveredInterruptedTaskAt(null);
    activeRoomTaskIdRef.current = null;
    autoConnectTokenRef.current += 1;
    handledTaskActionCallbackUrlRef.current = null;
    setLatestTaskActionCallback(null);
    setControlStatus('connecting');
    setVoiceStatusText(
      source === 'voice' ? '正在解析识别结果并路由控制...' : '正在解析并路由调试指令...'
    );
    setTranscript(normalizedInput || '等待输入调试指令');

    try {
      const result = await voiceCommandOrchestrator.execute(normalizedInput, {
        currentRoomBinding,
      });

      setLastCommandExecution(result);
      setCommandExecutionHistory(previous => prependExecutionHistory(previous, result));
      setVoiceStatusText(result.status);
      setTranscript(result.input || '等待输入调试指令');
      setResponsePreview(result.detail);
      setTaskFollowUpDraft(result.taskInterrupted ? buildTaskFollowUpDraft(result) : '');
      setControlStatus(
        result.route === 'room-agent'
          ? result.success
            ? result.taskTerminal
              ? 'connected'
              : result.taskInterrupted
              ? 'connected'
              : 'connecting'
            : 'error'
          : 'disconnected'
      );

      if (shouldTrackRoomTaskResult(result)) {
        activeRoomTaskIdRef.current = result.taskId;
        const subscribed = await controlService.subscribeToState(
          result.roomId,
          handleRoomTaskStateUpdate
        );

        if (subscribed && !result.taskTerminal && !result.taskInterrupted && activeRoomTaskIdRef.current === result.taskId) {
          setIsAwaitingCommandResult(true);
        }

        if (!subscribed) {
          activeRoomTaskIdRef.current = null;
          setVoiceStatusText(TASK_TRACKING_UNAVAILABLE_STATUS);
          setResponsePreview(TASK_TRACKING_UNAVAILABLE_DETAIL);
          setControlStatus('connected');
          setLastCommandExecution(previous =>
            previous && previous.taskId === result.taskId
              ? finalizeExecutionWithoutTaskTracking(previous)
              : previous
          );
          setCommandExecutionHistory(previous =>
            previous.map(item =>
              item.taskId === result.taskId ? finalizeExecutionWithoutTaskTracking(item) : item
            )
          );
        }
      }

      if (result.route === 'room-agent' && result.success && result.roomId) {
        activeRoomSnapshotRef.current = {
          roomId: result.roomId,
          roomName: result.roomName,
        };
        await controlService.subscribeToDescription(result.roomId, handleRoomAgentDescription);

        try {
          await controlService.queryCapabilities(result.roomId);
        } catch (error) {
          console.warn('[AppState] Failed to refresh room-agent description', error);
        }
      }
    } finally {
      setIsExecutingCommand(false);
    }
  }, [
    controlService,
    currentRoomBinding,
    handleRoomAgentDescription,
    handleRoomTaskStateUpdate,
    voiceCommandOrchestrator,
  ]);

  const submitTaskFollowUp = useCallback(async () => {
    if (isExecutingCommand || isRecognizingSpeech || isAwaitingCommandResult) {
      return;
    }

    if (!canContinueInterruptedRoomTask(lastCommandExecution)) {
      return;
    }

    const normalizedInput = taskFollowUpDraft.trim();
    if (!normalizedInput) {
      return;
    }

    if (!lastCommandExecution.intent.device || !lastCommandExecution.intent.action) {
      setVoiceStatusText('缺少继续任务所需的设备信息');
      setResponsePreview('当前任务缺少设备或动作上下文，无法基于同一 task 继续执行。');
      setControlStatus('error');
      return;
    }

    setIsExecutingCommand(true);
    setIsAwaitingCommandResult(false);
    activeRoomTaskIdRef.current = null;
    autoConnectTokenRef.current += 1;
    setControlStatus('connecting');
    setTranscript(normalizedInput);
    setResponsePreview('补充输入已准备发送，系统会复用当前 taskId/contextId 继续任务。');

    try {
      const connected = await ensureConnectedForInterruptedTask(lastCommandExecution);
      if (!connected) {
        return;
      }

      setVoiceStatusText('正在继续 Room-Agent 任务...');
      const dispatch = await controlService.sendControl(
        lastCommandExecution.roomId,
        normalizedInput,
        lastCommandExecution.intent.device,
        lastCommandExecution.intent.action,
        lastCommandExecution.intent.parameters,
        {
          taskId: lastCommandExecution.taskId,
          contextId: lastCommandExecution.taskContextId,
          metadata: buildTaskContinuationMetadata({
            taskState: lastCommandExecution.taskState,
            taskAction: lastCommandExecution.taskAction ?? null,
            callback: latestTaskActionCallback,
          }),
        }
      );

      const presentation = buildRoomTaskDispatchPresentation(dispatch, {
        roomName: lastCommandExecution.roomName,
        targetDevice: lastCommandExecution.intent.device,
        action: lastCommandExecution.intent.action,
      });
      const result: VoiceCommandExecutionResult = {
        ...lastCommandExecution,
        executedAt: Date.now(),
        input: normalizedInput,
        success: dispatch.success,
        status: presentation.status,
        detail: presentation.detail,
        taskId: dispatch.taskId,
        taskContextId: dispatch.contextId,
        taskState: dispatch.state,
        taskTerminal: dispatch.isTerminal,
        taskInterrupted: dispatch.isInterrupted,
        taskAction: dispatch.action,
      };

      setLastCommandExecution(result);
      setCommandExecutionHistory(previous => prependExecutionHistory(previous, result));
      setVoiceStatusText(result.status);
      setTranscript(result.input);
      setResponsePreview(result.detail);
      setTaskFollowUpDraft(result.taskInterrupted ? buildTaskFollowUpDraft(result) : '');
      setControlStatus(
        result.success
          ? result.taskTerminal || result.taskInterrupted
            ? 'connected'
            : 'connecting'
          : 'error'
      );

      if (result.taskTerminal) {
        setLatestTaskActionCallback(null);
        handledTaskActionCallbackUrlRef.current = null;
        setIsRecoveredInterruptedTask(false);
        setRecoveredInterruptedTaskAt(null);
      }

      if (shouldTrackRoomTaskResult(result)) {
        activeRoomTaskIdRef.current = result.taskId;
        const subscribed = await controlService.subscribeToState(
          result.roomId,
          handleRoomTaskStateUpdate
        );

        if (
          subscribed &&
          !result.taskTerminal &&
          !result.taskInterrupted &&
          activeRoomTaskIdRef.current === result.taskId
        ) {
          setIsAwaitingCommandResult(true);
        }

        if (!subscribed) {
          activeRoomTaskIdRef.current = null;
          setVoiceStatusText(TASK_TRACKING_UNAVAILABLE_STATUS);
          setResponsePreview(TASK_TRACKING_UNAVAILABLE_DETAIL);
          setControlStatus('connected');
          setLastCommandExecution(previous =>
            previous && previous.taskId === result.taskId
              ? finalizeExecutionWithoutTaskTracking(previous)
              : previous
          );
          setCommandExecutionHistory(previous =>
            previous.map(item =>
              item.taskId === result.taskId ? finalizeExecutionWithoutTaskTracking(item) : item
            )
          );
        }
      }
    } finally {
      setIsExecutingCommand(false);
    }
  }, [
    controlService,
    handleRoomTaskStateUpdate,
    isAwaitingCommandResult,
    isExecutingCommand,
    isRecognizingSpeech,
    lastCommandExecution,
    latestTaskActionCallback,
    taskFollowUpDraft,
    ensureConnectedForInterruptedTask,
  ]);

  const openCurrentTaskAction = useCallback(async () => {
    if (!lastCommandExecution?.taskAction?.url) {
      return;
    }

    setVoiceStatusText(
      lastCommandExecution.taskAction.kind === 'auth' ? '正在打开鉴权页面...' : '正在打开补充信息页面...'
    );
    setResponsePreview(
      lastCommandExecution.taskAction.kind === 'auth'
        ? '请在外部页面完成鉴权，返回应用后再继续当前任务。'
        : '请在外部页面查看补充要求，处理完成后再继续当前任务。'
    );

    try {
      const launch = await taskActionLauncherService.open(lastCommandExecution.taskAction);

      if (launch.callback) {
        handledTaskActionCallbackUrlRef.current = launch.callback.rawUrl;
        setLatestTaskActionCallback(launch.callback);
        setControlStatus('connected');
        setVoiceStatusText('已收到页面回跳，可以继续当前任务');
        setResponsePreview(
          lastCommandExecution.taskAction.kind === 'auth'
            ? `${describeTaskActionCallback(launch.callback)} 请确认状态后点击“继续任务”。`
            : `${describeTaskActionCallback(launch.callback)} 请确认内容后点击“继续任务”。`
        );
        return;
      }

      if (launch.outcome === 'dismissed') {
        setVoiceStatusText(
          lastCommandExecution.taskAction.kind === 'auth'
            ? '鉴权页面已关闭，尚未收到回跳'
            : '补充信息页面已关闭'
        );
        setResponsePreview(
          lastCommandExecution.taskAction.kind === 'auth'
            ? '外部鉴权流程已结束或被取消。若授权实际已完成，请手动点击“继续任务”把确认信息发回 Room-Agent。'
            : '外部页面已关闭。确认补充信息已处理后，再点击“继续任务”继续当前 task。'
        );
        setControlStatus('connected');
        return;
      }

      setVoiceStatusText(
        launch.method === 'linking'
          ? '已跳转到外部应用'
          : lastCommandExecution.taskAction.kind === 'auth'
            ? '鉴权页面已打开'
            : '补充信息页面已打开'
      );
      setResponsePreview(
        lastCommandExecution.taskAction.kind === 'auth'
          ? '完成鉴权后返回应用，并点击“继续任务”把确认信息发回 Room-Agent。'
          : '处理完补充信息后返回应用，并点击“继续任务”把补充内容发回 Room-Agent。'
      );
    } catch (error) {
      setVoiceStatusText(
        lastCommandExecution.taskAction.kind === 'auth' ? '无法打开鉴权页面' : '无法打开补充信息页面'
      );
      setResponsePreview(
        error instanceof Error
          ? error.message
          : '外部页面打开失败，请检查链接格式、设备权限和当前网络环境。'
      );
      setControlStatus('error');
    }
  }, [lastCommandExecution, taskActionLauncherService]);

  const recognizeRecording = useCallback(async (recording: AudioRecordingResult): Promise<void> => {
    setIsRecognizingSpeech(true);
    setControlStatus('connecting');
    setVoiceStatusText('正在上传录音并识别...');
    setTranscript(`识别中：${recording.fileName}`);
    setResponsePreview('录音文件已生成，正在调用后端 ASR 服务。');

    try {
      const recognition = await asrService.recognize(recording);
      const recognizedText = recognition.text.trim();

      if (!recognizedText) {
        setVoiceStatusText('未识别到有效语音');
        setTranscript('未识别到有效语音，请重试');
        setResponsePreview('ASR 已返回，但没有稳定文本结果，建议在更安静环境重试。');
        setControlStatus('error');
        return;
      }

      setCommandDraft(recognizedText);
      setTranscript(recognizedText);
      setResponsePreview('ASR 识别完成，正在进入意图解析与设备路由。');

      await executeVoiceCommand(recognizedText, 'voice');
    } catch (error) {
      console.warn('[AppState] ASR recognition failed', error);
      setVoiceStatusText('语音识别失败');
      setTranscript(`识别失败：${recording.fileName}`);
      setResponsePreview(
        error instanceof Error
          ? `ASR 上传或识别失败：${error.message}`
          : 'ASR 上传或识别失败，请检查后端服务和网络连通性。'
      );
      setControlStatus('error');
    } finally {
      setIsRecognizingSpeech(false);
    }
  }, [asrService, executeVoiceCommand]);

  useEffect(() => {
    let disposed = false;

    async function hydrateInitialState() {
      const [
        savedBinding,
        loadedPreferences,
        audioPermission,
        blePermission,
        loadedExecutionHistory,
        recoveredTask,
      ] = await Promise.all([
        beaconBindingCoordinator.hydrate(),
        preferenceService.loadPreferences(),
        audioRecordService.getPermissionStatus(),
        bleBeaconService.getPermissionStatus(),
        executionHistoryService.load(),
        interruptedTaskRecoveryService.load(),
      ]);

      if (disposed) {
        return;
      }

      activeRoomSnapshotRef.current = {
        roomId: savedBinding?.roomId ?? null,
        roomName: savedBinding?.roomName ?? null,
      };

      startTransition(() => {
        setCurrentRoomBinding(savedBinding);
        setPreferences(loadedPreferences);
        setMicrophonePermission(audioPermission);
        setBluetoothPermission(blePermission);
        setCommandExecutionHistory(loadedExecutionHistory);
      });

      if (recoveredTask) {
        startTransition(() => {
          setLastCommandExecution(recoveredTask.execution);
          setCommandExecutionHistory(previous =>
            mergeRecoveredExecutionIntoHistory(previous, recoveredTask.execution)
          );
          setTaskFollowUpDraft(
            recoveredTask.followUpDraft.trim().length > 0
              ? recoveredTask.followUpDraft
              : buildTaskFollowUpDraft(recoveredTask.execution)
          );
          setVoiceStatusText('已恢复上次暂停的 Room-Agent 任务');
          setTranscript(recoveredTask.execution.input);
          setResponsePreview(recoveredTask.execution.detail);
          setControlStatus('disconnected');
          setIsRecoveredInterruptedTask(true);
          setRecoveredInterruptedTaskAt(recoveredTask.savedAt);
        });
      }

      recoveryHydratedRef.current = true;
    }

    void hydrateInitialState();

    const unsubscribeScan = bleBeaconService.subscribe(handleScanResult);
    const unsubscribeDiagnostic = bleBeaconService.subscribeToDiagnostics(handleScanDiagnostic);
    const unsubscribeBinding = beaconBindingCoordinator.subscribe(handleBindingUpdate);

    return () => {
      disposed = true;
      console.debug('[AppState] Cleaning up app state provider');
      unsubscribeScan();
      unsubscribeDiagnostic();
      unsubscribeBinding();
      void beaconBindingCoordinator.destroy();
      void voiceCommandOrchestrator.destroy();
    };
  }, [
    audioRecordService,
    beaconBindingCoordinator,
    bleBeaconService,
    executionHistoryService,
    preferenceService,
    interruptedTaskRecoveryService,
    voiceCommandOrchestrator,
  ]);

  useEffect(() => {
    if (!recoveryHydratedRef.current) {
      return;
    }

    if (!currentRoomBinding) {
      if (lastAutoConnectBindingKeyRef.current !== null) {
        autoConnectTokenRef.current += 1;
      }
      lastAutoConnectBindingKeyRef.current = null;
      return;
    }

    if (lastAutoConnectBindingKeyRef.current === currentRoomAutoConnectKey) {
      return;
    }

    lastAutoConnectBindingKeyRef.current = currentRoomAutoConnectKey;
    void connectCurrentRoomAgent(currentRoomBinding);
  }, [currentRoomAutoConnectKey]);

  useEffect(() => {
    const subscription = Linking.addEventListener('url', event => {
      handleTaskActionCallbackUrl(event.url, 'event');
    });

    return () => {
      subscription.remove();
    };
  }, [handleTaskActionCallbackUrl]);

  useEffect(() => {
    if (initialTaskActionCallbackCheckedRef.current || !recoveryHydratedRef.current) {
      return;
    }

    if (!isRecoveredInterruptedTask || !canContinueInterruptedRoomTask(lastCommandExecution)) {
      return;
    }

    initialTaskActionCallbackCheckedRef.current = true;
    let disposed = false;

    async function restoreInitialTaskActionCallback() {
      try {
        const initialUrl = await Linking.getInitialURL();
        if (disposed || !initialUrl) {
          return;
        }

        handleTaskActionCallbackUrl(initialUrl, 'initial');
      } catch (error) {
        console.warn('[AppState] Failed to restore initial task action callback', error);
      }
    }

    void restoreInitialTaskActionCallback();

    return () => {
      disposed = true;
    };
  }, [handleTaskActionCallbackUrl, isRecoveredInterruptedTask, lastCommandExecution]);

  useEffect(() => {
    if (!recoveryHydratedRef.current) {
      return;
    }

    if (!commandExecutionHistory.length) {
      void executionHistoryService.clear();
      return;
    }

    void executionHistoryService.save(commandExecutionHistory);
  }, [commandExecutionHistory, executionHistoryService]);

  useEffect(() => {
    if (!recoveryHydratedRef.current) {
      return;
    }

    if (!canContinueInterruptedRoomTask(lastCommandExecution)) {
      void interruptedTaskRecoveryService.clear();
      return;
    }

    const draftToPersist =
      taskFollowUpDraft.trim().length > 0 ? taskFollowUpDraft : buildTaskFollowUpDraft(lastCommandExecution);

    void interruptedTaskRecoveryService.save(lastCommandExecution, draftToPersist);
  }, [interruptedTaskRecoveryService, lastCommandExecution, taskFollowUpDraft]);

  const value = useMemo<AppStateValue>(
    () => ({
      currentRoomBinding,
      discoveredBeacons,
      beaconDiagnostics,
      beaconScanIssue,
      isScanningBeacon,
      isStartingBeaconScan,
      controlStatus,
      microphonePermission,
      bluetoothPermission,
      recorderState,
      lastRecording,
      voiceStatusText,
      transcript,
      responsePreview,
      isRecognizingSpeech,
      preferences,
      commandDraft,
      taskFollowUpDraft,
      isExecutingCommand,
      isAwaitingCommandResult,
      lastCommandExecution,
      isRecoveredInterruptedTask,
      recoveredInterruptedTaskAt,
      commandExecutionHistory,
      roomAgentSnapshot,
      latestTaskActionCallback,
      toggleBeaconScanning: async () => {
        if (isStartingBeaconScan) {
          console.debug('[AppState] Beacon scan is already starting, please wait');
          return;
        }

        if (isScanningBeacon) {
          console.debug('[AppState] Stopping beacon scan from toggle action');
          await beaconBindingCoordinator.stop('user-toggle');
          setIsScanningBeacon(false);
          setBeaconScanIssue(null);
          return;
        }

        setDiscoveredBeacons([]);
        setBeaconDiagnostics([]);
        setBeaconScanIssue(null);
        setIsStartingBeaconScan(true);
        console.debug('[AppState] Starting beacon scan...');

        try {
          await beaconBindingCoordinator.start();
          setBluetoothPermission(await bleBeaconService.getPermissionStatus());
          setIsScanningBeacon(true);
        } catch (error) {
          console.warn('[AppState] Failed to start beacon scanning', error);
          const permission = await bleBeaconService.getPermissionStatus();
          setBluetoothPermission(permission);
          setBeaconScanIssue(buildBeaconScanIssue({ error, permission }));
        } finally {
          setIsStartingBeaconScan(false);
        }
      },
      unbindRoom: async () => {
        if (isStartingBeaconScan) {
          return;
        }

        const preserveInterruptedTask = canContinueInterruptedRoomTask(lastCommandExecution);
        if (isScanningBeacon) {
          console.debug('[AppState] Stopping beacon scan before unbinding room');
          await beaconBindingCoordinator.stop('unbind-room');
          setIsScanningBeacon(false);
          setDiscoveredBeacons([]);
          setBeaconDiagnostics([]);
        }

        await beaconBindingCoordinator.unbind();
        autoConnectTokenRef.current += 1;
        lastAutoConnectBindingKeyRef.current = null;
        activeRoomTaskIdRef.current = null;
        activeRoomSnapshotRef.current = {
          roomId: null,
          roomName: null,
        };
        setBeaconScanIssue(null);
        setControlStatus('disconnected');
        setIsAwaitingCommandResult(false);
        setRoomAgentSnapshot(null);
        setLatestTaskActionCallback(null);
        handledTaskActionCallbackUrlRef.current = null;
        if (preserveInterruptedTask) {
          setVoiceStatusText('房间已解绑，待继续任务已保留');
          setResponsePreview('继续任务前会重新发现并连接目标 Room-Agent。');
          return;
        }

        setLastCommandExecution(null);
        setTaskFollowUpDraft('');
        setIsRecoveredInterruptedTask(false);
        setRecoveredInterruptedTaskAt(null);
        setResponsePreview('待接入 room-agent / home-agent 执行结果');
      },
      toggleRecording: async () => {
        if (isRecognizingSpeech || isExecutingCommand || isAwaitingCommandResult) {
          return;
        }

        const existingState = audioRecordService.getRecorderState();

        if (existingState?.isRecording) {
          const recording = await audioRecordService.stopRecording();
          const snapshot = audioRecordService.getRecorderState();
          setRecorderState(snapshot);
          setLastRecording(recording);

          if (!recording) {
            setVoiceStatusText('录音结束，但没有检测到可用文件');
            setTranscript('录音结束，但没有检测到可用文件');
            return;
          }

          setVoiceStatusText('录音已完成，正在进入 ASR');
          setTranscript(`已生成录音文件：${recording.fileName}`);
          setResponsePreview('录音文件准备就绪，开始上传到后端 ASR。');
          await recognizeRecording(recording);
          return;
        }

        const permission = await audioRecordService.requestPermissions();
        setMicrophonePermission(permission);

        if (!permission.granted) {
          setVoiceStatusText('麦克风权限未授予，无法开始录音');
          return;
        }

        await audioRecordService.startRecording();
        setRecorderState(audioRecordService.getRecorderState());
        setVoiceStatusText('正在录音，停止后会保存音频文件');
        setTranscript('录音中...');
        setResponsePreview('录音文件准备就绪后，将自动进入 ASR、意图解析与控制路由。');
      },
      reloadPreferences: async () => {
        const nextPreferences = await preferenceService.loadPreferences();
        setPreferences(nextPreferences);
      },
      updateCommandDraft: (value: string) => {
        setCommandDraft(value);
      },
      updateTaskFollowUpDraft: (value: string) => {
        setTaskFollowUpDraft(value);
      },
      submitCommandDraft: async () => {
        if (isExecutingCommand || isRecognizingSpeech || isAwaitingCommandResult) {
          return;
        }

        await executeVoiceCommand(commandDraft, 'text');
      },
      submitTaskFollowUp,
      openCurrentTaskAction,
    }),
    [
      audioRecordService,
      beaconBindingCoordinator,
      beaconDiagnostics,
      beaconScanIssue,
      bleBeaconService,
      bluetoothPermission,
      commandDraft,
      commandExecutionHistory,
      controlStatus,
      currentRoomBinding,
      discoveredBeacons,
      executeVoiceCommand,
      isStartingBeaconScan,
      openCurrentTaskAction,
      isScanningBeacon,
      isExecutingCommand,
      isAwaitingCommandResult,
      isRecognizingSpeech,
      isRecoveredInterruptedTask,
      lastRecording,
      lastCommandExecution,
      microphonePermission,
      preferenceService,
      preferences,
      recognizeRecording,
      recorderState,
      recoveredInterruptedTaskAt,
      responsePreview,
      roomAgentSnapshot,
      latestTaskActionCallback,
      submitTaskFollowUp,
      taskFollowUpDraft,
      transcript,
      voiceStatusText,
    ]
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppStateValue {
  const context = useContext(AppStateContext);

  if (!context) {
    throw new Error('useAppState must be used within an AppStateProvider');
  }

  return context;
}
