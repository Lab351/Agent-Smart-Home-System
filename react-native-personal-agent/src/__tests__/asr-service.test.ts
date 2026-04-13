import { AsrService } from '@/services/asr-service';

describe('AsrService', () => {
  it('uploads the recorded file to /asr and returns the recognized text', async () => {
    const http = {
      uploadFile: jest.fn(async () => ({
        success: true,
        data: {
          text: '打开客厅主灯',
          confidence: 0.96,
        },
      })),
    };

    const service = new AsrService(http as never);
    const result = await service.recognize({
      uri: 'file:///tmp/personal-agent.m4a',
      durationMillis: 1500,
      fileName: 'personal-agent.m4a',
      mimeType: 'audio/m4a',
    });

    expect(http.uploadFile).toHaveBeenCalledWith(
      '/asr',
      {
        uri: 'file:///tmp/personal-agent.m4a',
        name: 'personal-agent.m4a',
        type: 'audio/m4a',
      },
      {
        format: 'aac',
        sampleRate: 16000,
      }
    );
    expect(result).toMatchObject({
      text: '打开客厅主灯',
      confidence: 0.96,
      durationMillis: 1500,
    });
  });

  it('preserves already supported audio formats', async () => {
    const http = {
      uploadFile: jest.fn(async () => ({
        success: true,
        data: {
          text: '播放音乐',
        },
      })),
    };

    const service = new AsrService(http as never);
    await service.recognize({
      uri: 'file:///tmp/voice.wav',
      durationMillis: 900,
      fileName: 'voice.wav',
      mimeType: 'audio/wav',
    });

    expect(http.uploadFile).toHaveBeenCalledWith(
      '/asr',
      expect.any(Object),
      expect.objectContaining({
        format: 'wav',
      })
    );
  });

  it('throws when the backend response is malformed', async () => {
    const http = {
      uploadFile: jest.fn(async () => ({
        success: false,
      })),
    };

    const service = new AsrService(http as never);

    await expect(
      service.recognize({
        uri: 'file:///tmp/voice.m4a',
        durationMillis: 1200,
        fileName: 'voice.m4a',
        mimeType: 'audio/m4a',
      })
    ).rejects.toThrow('ASR response is missing recognized text');
  });
});
