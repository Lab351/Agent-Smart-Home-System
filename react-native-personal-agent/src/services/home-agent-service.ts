import { appEnv } from '@/config/env';
import { HttpClient } from '@/platform/network/http-client';
import type { ParsedIntent } from '@/types';

type HomeTaskResponse = {
  success?: boolean;
};

export class HomeAgentService {
  constructor(private readonly http = new HttpClient(appEnv.backendUrl)) {}

  async sendTask(intent: ParsedIntent): Promise<boolean> {
    try {
      const response = await this.http.post<HomeTaskResponse>('/api/home/tasks', {
        source_agent: `watch-${appEnv.userId}`,
        intent: {
          room: intent.room,
          device: intent.device,
          action: intent.action,
          parameters: intent.parameters,
        },
      });

      return response.success ?? true;
    } catch (error) {
      console.warn('[HomeAgentService] Failed to send task to home-agent endpoint', error);
      return false;
    }
  }
}
