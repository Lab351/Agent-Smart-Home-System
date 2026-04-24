import { HomeAgentService } from '@/services/home-agent-service';

describe('HomeAgentService', () => {
  it('uses the RN personal-agent identity when sending tasks', async () => {
    const http = {
      post: jest.fn(async () => ({ success: true })),
    };
    const service = new HomeAgentService(http as never);

    await service.sendTask({
      text: '打开回家模式',
      kind: 'action',
      room: 'livingroom',
      device: 'scene',
      action: 'activate',
      parameters: { scene: 'home' },
      confidence: 0.92,
      source: 'llm',
      reply: null,
      query: null,
    });

    expect(http.post).toHaveBeenCalledWith('/api/home/tasks', {
      source_agent: 'personal-agent-user1',
      intent: {
        room: 'livingroom',
        device: 'scene',
        action: 'activate',
        parameters: { scene: 'home' },
      },
    });
  });
});
