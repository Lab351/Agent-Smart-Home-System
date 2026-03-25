import {
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

import {
  A2AHttpControlTransport,
  ControlService,
  BeaconBindingCoordinator,
  DiscoveryService,
  HomeAgentService,
  IntentService,
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
  BeaconScanResult,
  ConnectionStatus,
  PermissionSnapshot,
  RoomBinding,
  UserPreferences,
  VoiceCommandExecutionResult,
} from '@/types';

type AppStateValue = {
  currentRoomBinding: RoomBinding | null;
  discoveredBeacons: BeaconScanResult[];
  isScanningBeacon: boolean;
  mqttStatus: ConnectionStatus;
  controlStatus: ConnectionStatus;
  microphonePermission: PermissionSnapshot | null;
  bluetoothPermission: PermissionSnapshot | null;
  recorderState: AudioRecorderSnapshot | null;
  lastRecording: AudioRecordingResult | null;
  voiceStatusText: string;
  transcript: string;
  responsePreview: string;
  preferences: UserPreferences | null;
  commandDraft: string;
  isExecutingCommand: boolean;
  lastCommandExecution: VoiceCommandExecutionResult | null;
  toggleBeaconScanning: () => Promise<void>;
  unbindRoom: () => Promise<void>;
  toggleRecording: () => Promise<void>;
  reloadPreferences: () => Promise<void>;
  updateCommandDraft: (value: string) => void;
  submitCommandDraft: () => Promise<void>;
};

const AppStateContext = createContext<AppStateValue | null>(null);

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

export function AppStateProvider({ children }: PropsWithChildren) {
  const bleBeaconService = useRef(new BleBeaconService()).current;
  const audioRecordService = useRef(new ExpoAudioRecordService()).current;
  const preferenceService = useRef(new UserPreferenceService()).current;
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
  const [mqttStatus] = useState<ConnectionStatus>('disconnected');
  const [controlStatus, setControlStatus] = useState<ConnectionStatus>('disconnected');
  const [microphonePermission, setMicrophonePermission] = useState<PermissionSnapshot | null>(null);
  const [bluetoothPermission, setBluetoothPermission] = useState<PermissionSnapshot | null>(null);
  const [recorderState, setRecorderState] = useState<AudioRecorderSnapshot | null>(null);
  const [lastRecording, setLastRecording] = useState<AudioRecordingResult | null>(null);
  const [voiceStatusText, setVoiceStatusText] = useState('点击麦克风开始录音');
  const [transcript, setTranscript] = useState('等待录音输入');
  const [responsePreview, setResponsePreview] = useState('待接入 room-agent / home-agent 执行结果');
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [commandDraft, setCommandDraft] = useState('打开客厅主灯亮度调到80');
  const [isExecutingCommand, setIsExecutingCommand] = useState(false);
  const [lastCommandExecution, setLastCommandExecution] = useState<VoiceCommandExecutionResult | null>(
    null
  );

  const handleScanResult = useEffectEvent((result: BeaconScanResult) => {
    startTransition(() => {
      setDiscoveredBeacons(previous => mergeBeaconResult(previous, result));
    });
  });

  const handleBindingUpdate = useEffectEvent((binding: RoomBinding | null) => {
    startTransition(() => {
      setCurrentRoomBinding(binding);
    });
  });

  useEffect(() => {
    let disposed = false;

    async function hydrateInitialState() {
      const [savedBinding, loadedPreferences, audioPermission, blePermission] = await Promise.all([
        beaconBindingCoordinator.hydrate(),
        preferenceService.loadPreferences(),
        audioRecordService.getPermissionStatus(),
        bleBeaconService.getPermissionStatus(),
      ]);

      if (disposed) {
        return;
      }

      startTransition(() => {
        setCurrentRoomBinding(savedBinding);
        setPreferences(loadedPreferences);
        setMicrophonePermission(audioPermission);
        setBluetoothPermission(blePermission);
      });
    }

    void hydrateInitialState();

    const unsubscribeScan = bleBeaconService.subscribe(handleScanResult);
    const unsubscribeBinding = beaconBindingCoordinator.subscribe(handleBindingUpdate);

    return () => {
      disposed = true;
      unsubscribeScan();
      unsubscribeBinding();
      void beaconBindingCoordinator.destroy();
      void voiceCommandOrchestrator.destroy();
    };
  }, [
    audioRecordService,
    beaconBindingCoordinator,
    bleBeaconService,
    handleBindingUpdate,
    handleScanResult,
    preferenceService,
    voiceCommandOrchestrator,
  ]);

  const value = useMemo<AppStateValue>(
    () => ({
      currentRoomBinding,
      discoveredBeacons,
      isScanningBeacon,
      mqttStatus,
      controlStatus,
      microphonePermission,
      bluetoothPermission,
      recorderState,
      lastRecording,
      voiceStatusText,
      transcript,
      responsePreview,
      preferences,
      commandDraft,
      isExecutingCommand,
      lastCommandExecution,
      toggleBeaconScanning: async () => {
        if (isScanningBeacon) {
          await beaconBindingCoordinator.stop();
          setIsScanningBeacon(false);
          return;
        }

        try {
          await beaconBindingCoordinator.start();
          setBluetoothPermission(await bleBeaconService.getPermissionStatus());
          setIsScanningBeacon(true);
        } catch (error) {
          console.warn('[AppState] Failed to start beacon scanning', error);
          setBluetoothPermission(await bleBeaconService.getPermissionStatus());
        }
      },
      unbindRoom: async () => {
        await beaconBindingCoordinator.unbind();
        setControlStatus('disconnected');
        setLastCommandExecution(null);
        setResponsePreview('待接入 room-agent / home-agent 执行结果');
      },
      toggleRecording: async () => {
        const existingState = audioRecordService.getRecorderState();

        if (existingState?.isRecording) {
          const recording = await audioRecordService.stopRecording();
          const snapshot = audioRecordService.getRecorderState();
          setRecorderState(snapshot);
          setLastRecording(recording);
          setVoiceStatusText(recording ? '录音已完成，等待接入 ASR 上传' : '录音结束');
          setTranscript(
            recording
              ? `已生成录音文件：${recording.fileName}`
              : '录音结束，但没有检测到可用文件'
          );
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
        setResponsePreview('录音文件准备就绪后，将接入 ASR 与意图解析');
      },
      reloadPreferences: async () => {
        const nextPreferences = await preferenceService.loadPreferences();
        setPreferences(nextPreferences);
      },
      updateCommandDraft: (value: string) => {
        setCommandDraft(value);
      },
      submitCommandDraft: async () => {
        if (isExecutingCommand) {
          return;
        }

        setIsExecutingCommand(true);
        setControlStatus('connecting');
        setVoiceStatusText('正在解析并路由调试指令...');
        setTranscript(commandDraft.trim() || '等待输入调试指令');

        try {
          const result = await voiceCommandOrchestrator.execute(commandDraft, {
            currentRoomBinding,
          });

          setLastCommandExecution(result);
          setVoiceStatusText(result.status);
          setTranscript(result.input || '等待输入调试指令');
          setResponsePreview(result.detail);
          setControlStatus(
            result.route === 'room-agent'
              ? result.success
                ? 'connected'
                : 'error'
              : 'disconnected'
          );
        } finally {
          setIsExecutingCommand(false);
        }
      },
    }),
    [
      audioRecordService,
      beaconBindingCoordinator,
      bleBeaconService,
      bluetoothPermission,
      commandDraft,
      controlStatus,
      currentRoomBinding,
      discoveredBeacons,
      isScanningBeacon,
      isExecutingCommand,
      lastRecording,
      lastCommandExecution,
      microphonePermission,
      mqttStatus,
      preferenceService,
      preferences,
      recorderState,
      responsePreview,
      transcript,
      voiceCommandOrchestrator,
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
