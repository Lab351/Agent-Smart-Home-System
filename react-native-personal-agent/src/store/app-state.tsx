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
  BeaconBindingCoordinator,
  UserPreferenceService,
} from '@/services';
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
} from '@/types';

type AppStateValue = {
  currentRoomBinding: RoomBinding | null;
  discoveredBeacons: BeaconScanResult[];
  isScanningBeacon: boolean;
  mqttStatus: ConnectionStatus;
  microphonePermission: PermissionSnapshot | null;
  bluetoothPermission: PermissionSnapshot | null;
  recorderState: AudioRecorderSnapshot | null;
  lastRecording: AudioRecordingResult | null;
  voiceStatusText: string;
  transcript: string;
  responsePreview: string;
  preferences: UserPreferences | null;
  toggleBeaconScanning: () => Promise<void>;
  unbindRoom: () => Promise<void>;
  toggleRecording: () => Promise<void>;
  reloadPreferences: () => Promise<void>;
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

  const [currentRoomBinding, setCurrentRoomBinding] = useState<RoomBinding | null>(null);
  const [discoveredBeacons, setDiscoveredBeacons] = useState<BeaconScanResult[]>([]);
  const [isScanningBeacon, setIsScanningBeacon] = useState(false);
  const [mqttStatus] = useState<ConnectionStatus>('disconnected');
  const [microphonePermission, setMicrophonePermission] = useState<PermissionSnapshot | null>(null);
  const [bluetoothPermission, setBluetoothPermission] = useState<PermissionSnapshot | null>(null);
  const [recorderState, setRecorderState] = useState<AudioRecorderSnapshot | null>(null);
  const [lastRecording, setLastRecording] = useState<AudioRecordingResult | null>(null);
  const [voiceStatusText, setVoiceStatusText] = useState('点击麦克风开始录音');
  const [transcript, setTranscript] = useState('等待录音输入');
  const [responsePreview, setResponsePreview] = useState('待接入 room-agent / home-agent 执行结果');
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);

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
    };
  }, [
    audioRecordService,
    beaconBindingCoordinator,
    bleBeaconService,
    handleBindingUpdate,
    handleScanResult,
    preferenceService,
  ]);

  const value = useMemo<AppStateValue>(
    () => ({
      currentRoomBinding,
      discoveredBeacons,
      isScanningBeacon,
      mqttStatus,
      microphonePermission,
      bluetoothPermission,
      recorderState,
      lastRecording,
      voiceStatusText,
      transcript,
      responsePreview,
      preferences,
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
    }),
    [
      audioRecordService,
      beaconBindingCoordinator,
      bleBeaconService,
      bluetoothPermission,
      currentRoomBinding,
      discoveredBeacons,
      isScanningBeacon,
      lastRecording,
      microphonePermission,
      mqttStatus,
      preferenceService,
      preferences,
      recorderState,
      responsePreview,
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
