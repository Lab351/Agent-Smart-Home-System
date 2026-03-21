import {
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  RecordingPresets,
  setAudioModeAsync,
  type PermissionResponse,
  type AudioRecorder,
  type RecorderState,
} from 'expo-audio';
import AudioModule from 'expo-audio/build/AudioModule';

import type {
  AudioRecorderSnapshot,
  AudioRecordingResult,
  IAudioRecordService,
  PermissionSnapshot,
} from '@/types';

function toPermissionSnapshot(permission: PermissionResponse): PermissionSnapshot {
  return {
    granted: permission.granted,
    canAskAgain: permission.canAskAgain,
    status: permission.granted ? 'granted' : permission.status === 'denied' ? 'denied' : 'undetermined',
  };
}

export class ExpoAudioRecordService implements IAudioRecordService {
  private recorder: AudioRecorder | null = null;
  private lastKnownState: AudioRecorderSnapshot | null = null;

  constructor(
    private readonly recorderFactory: () => AudioRecorder = () =>
      new AudioModule.AudioRecorder(RecordingPresets.HIGH_QUALITY) as AudioRecorder
  ) {}

  async getPermissionStatus(): Promise<PermissionSnapshot> {
    return toPermissionSnapshot(await getRecordingPermissionsAsync());
  }

  async requestPermissions(): Promise<PermissionSnapshot> {
    return toPermissionSnapshot(await requestRecordingPermissionsAsync());
  }

  async startRecording(): Promise<void> {
    const existingPermission = await this.getPermissionStatus();
    const permission = existingPermission.granted
      ? existingPermission
      : await this.requestPermissions();

    if (!permission.granted) {
      throw new Error('Microphone permission is not granted');
    }

    await setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      shouldRouteThroughEarpiece: false,
      allowsBackgroundRecording: false,
    });

    const recorder = this.ensureRecorder();
    await recorder.prepareToRecordAsync(RecordingPresets.HIGH_QUALITY);
    recorder.record();
    this.lastKnownState = this.toSnapshot(recorder.getStatus());
  }

  async stopRecording(): Promise<AudioRecordingResult | null> {
    if (!this.recorder) {
      return null;
    }

    await this.recorder.stop();

    const snapshot = this.toSnapshot(this.recorder.getStatus());
    this.lastKnownState = snapshot;

    if (!snapshot.uri) {
      return null;
    }

    return {
      uri: snapshot.uri,
      durationMillis: snapshot.durationMillis,
      fileName: snapshot.uri.split('/').pop() ?? 'recording.m4a',
      mimeType: 'audio/m4a',
    };
  }

  async cancelRecording(): Promise<void> {
    if (!this.recorder) {
      return;
    }

    if (this.recorder.getStatus().isRecording) {
      await this.recorder.stop();
    }

    this.recorder = null;
    this.lastKnownState = null;
  }

  getRecorderState(): AudioRecorderSnapshot | null {
    if (!this.recorder) {
      return this.lastKnownState;
    }

    this.lastKnownState = this.toSnapshot(this.recorder.getStatus());
    return this.lastKnownState;
  }

  private ensureRecorder(): AudioRecorder {
    if (!this.recorder) {
      this.recorder = this.recorderFactory();
    }

    return this.recorder;
  }

  private toSnapshot(status: RecorderState): AudioRecorderSnapshot {
    return {
      canRecord: status.canRecord,
      isRecording: status.isRecording,
      durationMillis: status.durationMillis,
      metering: status.metering,
      uri: status.url,
    };
  }
}
