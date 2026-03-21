import {
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';

import { ExpoAudioRecordService } from '@/platform/audio/expo-audio-record-service';

jest.mock('expo-audio', () => {
  class MockAudioRecorder {
    status = {
      canRecord: true,
      isRecording: false,
      durationMillis: 0,
      metering: 0,
      url: null,
    };

    async prepareToRecordAsync() {
      return undefined;
    }

    record() {
      this.status = {
        ...this.status,
        isRecording: true,
      };
    }

    async stop() {
      this.status = {
        ...this.status,
        isRecording: false,
        durationMillis: 1200,
        url: 'file:///tmp/personal-agent.m4a',
      };
    }

    getStatus() {
      return this.status;
    }
  }

  return {
    AudioRecorder: MockAudioRecorder,
    RecordingPresets: {
      HIGH_QUALITY: {},
    },
    getRecordingPermissionsAsync: jest.fn(async () => ({
      granted: true,
      canAskAgain: true,
      status: 'granted',
    })),
    requestRecordingPermissionsAsync: jest.fn(async () => ({
      granted: true,
      canAskAgain: true,
      status: 'granted',
    })),
    setAudioModeAsync: jest.fn(async () => undefined),
  };
});

describe('ExpoAudioRecordService', () => {
  it('starts and stops recording through the public expo-audio API', async () => {
    const service = new ExpoAudioRecordService();

    await service.startRecording();

    expect(setAudioModeAsync).toHaveBeenCalledWith({
      allowsRecording: true,
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      shouldRouteThroughEarpiece: false,
      allowsBackgroundRecording: false,
    });
    expect(service.getRecorderState()).toMatchObject({
      isRecording: true,
    });

    await expect(service.stopRecording()).resolves.toMatchObject({
      uri: 'file:///tmp/personal-agent.m4a',
      fileName: 'personal-agent.m4a',
      durationMillis: 1200,
    });
  });

  it('requests permission before recording when needed', async () => {
    (getRecordingPermissionsAsync as jest.Mock).mockResolvedValueOnce({
      granted: false,
      canAskAgain: true,
      status: 'undetermined',
    });

    const service = new ExpoAudioRecordService();
    await service.startRecording();

    expect(requestRecordingPermissionsAsync).toHaveBeenCalled();
  });
});
