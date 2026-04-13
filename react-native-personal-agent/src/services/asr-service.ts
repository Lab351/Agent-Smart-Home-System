import { appEnv } from '@/config/env';
import { HttpClient } from '@/platform/network/http-client';
import type { AudioRecordingResult, VoiceRecognitionResult } from '@/types';

type AsrApiResponse = {
  success?: boolean;
  data?: {
    text?: string;
    confidence?: number | null;
  };
};

const DEFAULT_ASR_FORMAT = 'aac';
const DEFAULT_ASR_SAMPLE_RATE = 16000;

export class AsrService {
  constructor(private readonly http = new HttpClient(appEnv.backendUrl)) {}

  async recognize(recording: AudioRecordingResult): Promise<VoiceRecognitionResult> {
    const format = this.resolveFormat(recording);
    const response = await this.http.uploadFile<AsrApiResponse>(
      '/asr',
      {
        uri: recording.uri,
        name: recording.fileName,
        type: recording.mimeType,
      },
      {
        format,
        sampleRate: DEFAULT_ASR_SAMPLE_RATE,
      }
    );

    if (!response.success || !response.data) {
      throw new Error('ASR response is missing recognized text');
    }

    return {
      text: response.data.text?.trim() ?? '',
      confidence: response.data.confidence ?? null,
      durationMillis: recording.durationMillis,
      uri: recording.uri,
      raw: response,
    };
  }

  private resolveFormat(recording: AudioRecordingResult): string {
    const extension = recording.fileName.split('.').pop()?.toLowerCase() ?? '';
    const mimeSubtype = recording.mimeType.split('/').pop()?.toLowerCase() ?? '';
    const candidate = extension || mimeSubtype;

    if (candidate === 'm4a' || candidate === 'mp4' || candidate === 'mpeg4') {
      return DEFAULT_ASR_FORMAT;
    }

    return candidate || DEFAULT_ASR_FORMAT;
  }
}
