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
        source_agent: appEnv.personalAgentId,
        text: intent.text,
        routing: intent.routing
          ? {
              target: intent.routing.target,
              room_id: intent.routing.roomId ?? null,
              agent_id: intent.routing.agentId ?? null,
              reason: intent.routing.reason ?? null,
            }
          : null,
        query: intent.query
          ? {
              type: intent.query.type,
              room_id: intent.query.roomId ?? null,
              reason: intent.query.reason ?? null,
            }
          : null,
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
