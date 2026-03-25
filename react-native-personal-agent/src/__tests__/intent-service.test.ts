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

  it('keeps the current room context when local fallback does not parse a room', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const http = {
      post: jest.fn(async () => {
        throw new Error('network down');
      }),
    };

    const service = new IntentService(http as never);
    const intent = await service.parse('打开主灯', {
      currentRoom: 'bedroom',
    });

    expect(intent).toMatchObject({
      device: 'main_light',
      action: 'turn_on',
      room: 'bedroom',
      source: 'fallback',
    });

    warnSpy.mockRestore();
  });

  it('prefers more specific device aliases during local parsing', () => {
    const service = new IntentService({ post: jest.fn() } as never);
    const intent = service.parseLocal('打开客厅主灯');

    expect(intent.device).toBe('main_light');
  });

  it('extracts brightness values from phrases using 调到', () => {
    const service = new IntentService({ post: jest.fn() } as never);
    const intent = service.parseLocal('把卧室灯亮度调到80');

    expect(intent.parameters).toMatchObject({
      brightness: 80,
    });
  });
});
