import { IntentService } from '@/services/intent-service';

describe('IntentService', () => {
  it('uses the backend result when the intent API returns an action route', async () => {
    const http = {
      post: jest.fn(async () => ({
        success: true,
        data: {
          kind: 'action',
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
      kind: 'action',
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

  it('maps backend query results into room device queries', async () => {
    const http = {
      post: jest.fn(async () => ({
        success: true,
        data: {
          kind: 'query',
          query: {
            type: 'room_devices',
            room_id: 'livingroom',
            reason: 'asking for room devices',
          },
          routing: {
            target: 'room-agent',
            room_id: 'livingroom',
            reason: 'query current room agent',
          },
        },
      })),
    };

    const service = new IntentService(http as never);
    const intent = await service.parse('房间里有什么设备', {
      currentRoom: 'livingroom',
    });

    expect(intent).toMatchObject({
      kind: 'query',
      room: 'livingroom',
      source: 'llm',
      query: {
        type: 'room_devices',
        roomId: 'livingroom',
      },
      routing: {
        target: 'room-agent',
      },
    });
  });

  it('maps backend room state queries into query intents', async () => {
    const http = {
      post: jest.fn(async () => ({
        success: true,
        data: {
          kind: 'query',
          query: {
            type: 'room_state',
            room_id: 'livingroom',
            reason: 'asking for room state',
          },
          routing: {
            target: 'room-agent',
            room_id: 'livingroom',
            reason: 'query current room state',
          },
        },
      })),
    };

    const service = new IntentService(http as never);
    const intent = await service.parse('客厅灯现在开着吗', {
      currentRoom: 'livingroom',
    });

    expect(intent).toMatchObject({
      kind: 'query',
      room: 'livingroom',
      source: 'llm',
      query: {
        type: 'room_state',
        roomId: 'livingroom',
      },
    });
  });

  it('maps backend chat results into direct replies', async () => {
    const http = {
      post: jest.fn(async () => ({
        success: true,
        data: {
          kind: 'chat',
          reply: '你好，我可以帮你查询设备和控制家居。',
          routing: {
            target: null,
            room_id: null,
            reason: 'simple chat',
          },
        },
      })),
    };

    const service = new IntentService(http as never);
    const intent = await service.parse('你好');

    expect(intent).toMatchObject({
      kind: 'chat',
      source: 'llm',
      reply: '你好，我可以帮你查询设备和控制家居。',
      routing: {
        target: null,
      },
    });
  });

  it('falls back to local query parsing when the intent API fails', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const http = {
      post: jest.fn(async () => {
        throw new Error('network down');
      }),
    };

    const service = new IntentService(http as never);
    const intent = await service.parse('房间里有什么设备', {
      currentRoom: 'bedroom',
    });

    expect(intent).toMatchObject({
      kind: 'query',
      room: 'bedroom',
      source: 'fallback',
      query: {
        type: 'room_devices',
        roomId: 'bedroom',
      },
    });

    warnSpy.mockRestore();
  });

  it('falls back to local room state parsing when the intent API fails', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const http = {
      post: jest.fn(async () => {
        throw new Error('network down');
      }),
    };

    const service = new IntentService(http as never);
    const intent = await service.parse('客厅灯现在开着吗', {
      currentRoom: 'bedroom',
    });

    expect(intent).toMatchObject({
      kind: 'query',
      room: 'livingroom',
      source: 'fallback',
      query: {
        type: 'room_state',
        roomId: 'livingroom',
      },
    });

    warnSpy.mockRestore();
  });

  it('falls back to local action parsing when the intent API fails', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const http = {
      post: jest.fn(async () => {
        throw new Error('network down');
      }),
    };

    const service = new IntentService(http as never);
    const intent = await service.parse('打开客厅灯亮度80');

    expect(intent).toMatchObject({
      kind: 'action',
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

  it('uses a local chat fallback when no query or action keyword is found', () => {
    const service = new IntentService({ post: jest.fn() } as never);
    const intent = service.parseLocal('你好呀');

    expect(intent).toMatchObject({
      kind: 'chat',
      reply: '我先陪你聊聊，当前没有识别到控制或查询请求。',
      device: null,
      action: null,
    });
  });

  it('prefers more specific device aliases during local action parsing', () => {
    const service = new IntentService({ post: jest.fn() } as never);
    const intent = service.parseLocal('打开客厅主灯');

    expect(intent.kind).toBe('action');
    expect(intent.device).toBe('main_light');
  });
});
