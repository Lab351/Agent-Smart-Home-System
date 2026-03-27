import { VoiceCommandOrchestrator } from '@/services/voice-command-orchestrator';
import type { ParsedIntent } from '@/types';

function createIntent(overrides: Partial<ParsedIntent> = {}): ParsedIntent {
  return {
    text: '打开客厅主灯',
    device: 'main_light',
    action: 'turn_on',
    room: 'livingroom',
    parameters: {},
    confidence: 0.92,
    source: 'llm',
    ...overrides,
  };
}

describe('VoiceCommandOrchestrator', () => {
  it('routes room commands through discovery and control service', async () => {
    const intentService = {
      parse: jest.fn(async () => createIntent()),
    };
    const discoveryService = {
      getRoomAgentByRoomId: jest.fn(async () => ({
        roomId: 'livingroom',
        roomName: '客厅',
        beaconId: '1',
        agentId: 'room-agent-livingroom',
        url: 'http://127.0.0.1:8001/a2a',
        devices: [],
        capabilities: ['lighting'],
      })),
      destroy: jest.fn(),
    };
    const controlService = {
      setRoomAgent: jest.fn(),
      connect: jest.fn(async () => true),
      sendControl: jest.fn(async () => true),
      destroy: jest.fn(async () => undefined),
    };
    const homeAgentService = {
      sendTask: jest.fn(async () => true),
    };

    const orchestrator = new VoiceCommandOrchestrator(
      intentService as never,
      discoveryService as never,
      controlService as never,
      homeAgentService as never
    );

    const result = await orchestrator.execute('打开客厅主灯');

    expect(discoveryService.getRoomAgentByRoomId).toHaveBeenCalledWith('livingroom');
    expect(controlService.connect).toHaveBeenCalled();
    expect(controlService.sendControl).toHaveBeenCalledWith(
      'livingroom',
      'main_light',
      'turn_on',
      {}
    );
    expect(result).toMatchObject({
      success: true,
      route: 'room-agent',
      status: '命令已发送到 Room-Agent',
    });
  });

  it('routes home-agent tasks when the parsed intent requires global handling', async () => {
    const intentService = {
      parse: jest.fn(async () =>
        createIntent({
          routing: {
            target: 'home-agent',
            roomId: 'livingroom',
            reason: 'global scene',
          },
        })
      ),
    };
    const homeAgentService = {
      sendTask: jest.fn(async () => true),
    };

    const orchestrator = new VoiceCommandOrchestrator(
      intentService as never,
      { getRoomAgentByRoomId: jest.fn(), destroy: jest.fn() } as never,
      { destroy: jest.fn(async () => undefined) } as never,
      homeAgentService as never
    );

    const result = await orchestrator.execute('打开回家模式');

    expect(homeAgentService.sendTask).toHaveBeenCalled();
    expect(result).toMatchObject({
      success: true,
      route: 'home-agent',
      status: '已转交 Home-Agent',
    });
  });

  it('returns a failed execution result when the room-agent transport throws', async () => {
    const intentService = {
      parse: jest.fn(async () => createIntent()),
    };
    const discoveryService = {
      getRoomAgentByRoomId: jest.fn(async () => ({
        roomId: 'livingroom',
        roomName: '客厅',
        beaconId: '1',
        agentId: 'room-agent-livingroom',
        url: 'http://127.0.0.1:8001/a2a',
        devices: [],
        capabilities: ['lighting'],
      })),
      destroy: jest.fn(),
    };
    const controlService = {
      setRoomAgent: jest.fn(),
      connect: jest.fn(async () => true),
      sendControl: jest.fn(async () => {
        throw new Error('network down');
      }),
      destroy: jest.fn(async () => undefined),
    };

    const orchestrator = new VoiceCommandOrchestrator(
      intentService as never,
      discoveryService as never,
      controlService as never,
      { sendTask: jest.fn(async () => true) } as never
    );
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = await orchestrator.execute('打开客厅主灯');

    expect(result).toMatchObject({
      success: false,
      route: 'room-agent',
      status: '控制链路异常',
      roomId: 'livingroom',
    });

    warnSpy.mockRestore();
  });

  it('prefers the resolved room name over the current binding fallback', async () => {
    const intentService = {
      parse: jest.fn(async () =>
        createIntent({
          room: 'bedroom',
          device: null,
        })
      ),
    };
    const orchestrator = new VoiceCommandOrchestrator(
      intentService as never,
      { getRoomAgentByRoomId: jest.fn(), destroy: jest.fn() } as never,
      { destroy: jest.fn(async () => undefined) } as never,
      { sendTask: jest.fn(async () => true) } as never
    );

    const result = await orchestrator.execute('打开卧室', {
      currentRoomBinding: {
        roomId: 'livingroom',
        roomName: '客厅',
        beaconId: '1',
        rssi: null,
        distance: null,
        updatedAt: Date.now(),
      },
    });

    expect(result).toMatchObject({
      success: false,
      status: '缺少设备目标',
      roomId: 'bedroom',
      roomName: '卧室',
    });
  });

  it('resolves the parsed room name when action parsing fails', async () => {
    const intentService = {
      parse: jest.fn(async () =>
        createIntent({
          room: 'bedroom',
          action: null,
          device: 'main_light',
        })
      ),
    };
    const orchestrator = new VoiceCommandOrchestrator(
      intentService as never,
      { getRoomAgentByRoomId: jest.fn(), destroy: jest.fn() } as never,
      { destroy: jest.fn(async () => undefined) } as never,
      { sendTask: jest.fn(async () => true) } as never
    );

    const result = await orchestrator.execute('卧室主灯', {
      currentRoomBinding: {
        roomId: 'livingroom',
        roomName: '客厅',
        beaconId: '1',
        rssi: null,
        distance: null,
        updatedAt: Date.now(),
      },
    });

    expect(result).toMatchObject({
      success: false,
      status: '意图未识别',
      roomId: 'bedroom',
      roomName: '卧室',
    });
  });
});
