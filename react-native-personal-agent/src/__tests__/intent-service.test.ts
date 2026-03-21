import { IntentService } from '@/services/intent-service';

describe('IntentService', () => {
  it('uses the backend result when the intent API succeeds', async () => {
    const http = {
      post: jest.fn(async () => ({
        success: true,
        data: {
          intent: {
            device: 'light',
            action: 'turn_on',
            parameters: { brightness: 80 },
            confidence: 0.93,
          },
          routing: {
            target: 'room-agent',
            room_id: 'livingroom',
            agent_id: 'room-agent-livingroom',
            reason: 'current room match',
          },
        },
      })),
    };

    const service = new IntentService(http as never);
    const intent = await service.parse('打开客厅主灯', {
      currentRoom: 'livingroom',
      currentBeaconId: '1',
    });

    expect(intent).toMatchObject({
      device: 'light',
      action: 'turn_on',
      room: 'livingroom',
      source: 'llm',
      routing: {
        target: 'room-agent',
        agentId: 'room-agent-livingroom',
      },
    });
  });

  it('falls back to local parsing when the intent API fails', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const http = {
      post: jest.fn(async () => {
        throw new Error('network down');
      }),
    };

    const service = new IntentService(http as never);
    const intent = await service.parse('打开客厅灯亮度80');

    expect(intent).toMatchObject({
      device: 'light',
      action: 'turn_on',
      room: 'livingroom',
      source: 'fallback',
      parameters: {
        brightness: 80,
      },
    });

    warnSpy.mockRestore();
  });
});
