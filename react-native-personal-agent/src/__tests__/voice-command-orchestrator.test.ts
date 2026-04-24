import { VoiceCommandOrchestrator } from '@/services/voice-command-orchestrator';
import type { ParsedIntent } from '@/types';

function createIntent(overrides: Partial<ParsedIntent> = {}): ParsedIntent {
  return {
    text: '打开客厅主灯',
    kind: 'agent_message',
    device: 'main_light',
    action: 'turn_on',
    room: 'livingroom',
    parameters: {},
    confidence: 0.92,
    source: 'llm',
    reply: null,
    query: null,
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
      sendControl: jest.fn(async () => ({
        success: true,
        taskId: 'task-1',
        state: 'submitted',
        isTerminal: false,
        isInterrupted: false,
        detail: 'Room-Agent 已接收控制请求，等待开始执行。',
      })),
      destroy: jest.fn(async () => undefined),
    };
    const homeAgentService = {
      sendTask: jest.fn(async () => true),
    };

    const orchestrator = new VoiceCommandOrchestrator(
      intentService as never,
      discoveryService as never,
      controlService as never,
      homeAgentService as never,
    );

    const result = await orchestrator.execute('打开客厅主灯');

    expect(discoveryService.getRoomAgentByRoomId).toHaveBeenCalledWith('livingroom');
    expect(controlService.connect).toHaveBeenCalled();
    expect(controlService.sendControl).toHaveBeenCalledWith(
      'livingroom',
      '打开客厅主灯',
      'main_light',
      'turn_on',
      {},
    );
    expect(result).toMatchObject({
      success: true,
      route: 'room-agent',
      status: '命令已提交到 Room-Agent',
      taskId: 'task-1',
      taskState: 'submitted',
      taskTerminal: false,
    });
  });

  it('returns chat replies without touching discovery or control', async () => {
    const intentService = {
      parse: jest.fn(async () =>
        createIntent({
          kind: 'chat',
          device: null,
          action: null,
          reply: '你好，我可以帮你查询设备和控制家居。',
        }),
      ),
    };
    const discoveryService = {
      getRoomAgentByRoomId: jest.fn(),
      destroy: jest.fn(),
    };
    const controlService = {
      connect: jest.fn(),
      sendControl: jest.fn(),
      destroy: jest.fn(async () => undefined),
    };

    const orchestrator = new VoiceCommandOrchestrator(
      intentService as never,
      discoveryService as never,
      controlService as never,
      { sendTask: jest.fn(async () => true) } as never,
    );

    const result = await orchestrator.execute('你好');

    expect(discoveryService.getRoomAgentByRoomId).not.toHaveBeenCalled();
    expect(controlService.connect).not.toHaveBeenCalled();
    expect(controlService.sendControl).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: true,
      route: 'chat',
      status: '已生成对话回复',
      detail: '你好，我可以帮你查询设备和控制家居。',
    });
  });

  it('routes room device queries through A2A query dispatch without using capability snapshots', async () => {
    const intentService = {
      parse: jest.fn(async () =>
        createIntent({
          text: '房间里有什么设备',
          kind: 'agent_message',
          device: null,
          action: null,
          query: {
            type: 'room_devices',
            roomId: 'livingroom',
            reason: 'ask room devices',
          },
        }),
      ),
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
      queryRoomDevices: jest.fn(async () => ({
        success: true,
        taskId: null,
        contextId: 'ctx-query-devices-1',
        state: 'completed',
        isTerminal: true,
        isInterrupted: false,
        detail: '客厅当前可控制的设备有主灯、窗帘和空调。',
        action: null,
      })),
      queryCapabilities: jest.fn(),
      sendControl: jest.fn(),
      destroy: jest.fn(async () => undefined),
      getLastError: jest.fn(() => null),
    };

    const orchestrator = new VoiceCommandOrchestrator(
      intentService as never,
      discoveryService as never,
      controlService as never,
      { sendTask: jest.fn(async () => true) } as never,
    );

    const result = await orchestrator.execute('房间里有什么设备');

    expect(discoveryService.getRoomAgentByRoomId).toHaveBeenCalledWith('livingroom');
    expect(controlService.connect).toHaveBeenCalled();
    expect(controlService.queryRoomDevices).toHaveBeenCalledWith(
      'livingroom',
      '房间里有什么设备',
      {
        metadata: {
          queryType: 'room_devices',
        },
      },
    );
    expect(controlService.queryCapabilities).not.toHaveBeenCalled();
    expect(controlService.sendControl).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: true,
      route: 'query',
      status: '已收到房间设备信息',
      detail: '客厅当前可控制的设备有主灯、窗帘和空调。',
      roomId: 'livingroom',
      taskState: 'completed',
    });
  });

  it('routes room state queries through A2A query dispatch without using control actions', async () => {
    const intentService = {
      parse: jest.fn(async () =>
        createIntent({
          text: '客厅灯现在开着吗',
          kind: 'agent_message',
          device: null,
          action: null,
          query: {
            type: 'room_state',
            roomId: 'livingroom',
            reason: 'ask room state',
          },
        }),
      ),
    };
    const discoveryService = {
      getRoomAgentByRoomId: jest.fn(async () => ({
        roomId: 'livingroom',
        roomName: '客厅',
        beaconId: '1',
        agentId: 'room-agent-livingroom',
        url: 'http://127.0.0.1:8001/a2a',
        devices: [],
        capabilities: ['lighting', 'state_query'],
      })),
      destroy: jest.fn(),
    };
    const controlService = {
      setRoomAgent: jest.fn(),
      connect: jest.fn(async () => true),
      queryRoomState: jest.fn(async () => ({
        success: true,
        taskId: null,
        contextId: 'ctx-query-1',
        state: 'completed',
        isTerminal: true,
        isInterrupted: false,
        detail: '客厅主灯当前处于开启状态。',
        action: null,
      })),
      queryCapabilities: jest.fn(),
      sendControl: jest.fn(),
      destroy: jest.fn(async () => undefined),
      getLastError: jest.fn(() => null),
    };

    const orchestrator = new VoiceCommandOrchestrator(
      intentService as never,
      discoveryService as never,
      controlService as never,
      { sendTask: jest.fn(async () => true) } as never,
    );

    const result = await orchestrator.execute('客厅灯现在开着吗');

    expect(discoveryService.getRoomAgentByRoomId).toHaveBeenCalledWith('livingroom');
    expect(controlService.connect).toHaveBeenCalled();
    expect(controlService.queryRoomState).toHaveBeenCalledWith(
      'livingroom',
      '客厅灯现在开着吗',
      {
        metadata: {
          queryType: 'room_state',
        },
      },
    );
    expect(controlService.queryCapabilities).not.toHaveBeenCalled();
    expect(controlService.sendControl).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: true,
      route: 'query',
      status: '已收到房间状态',
      detail: '客厅主灯当前处于开启状态。',
      roomId: 'livingroom',
      taskState: 'completed',
    });
  });

  it('returns an unresolved result when room device queries have no room context', async () => {
    const intentService = {
      parse: jest.fn(async () =>
        createIntent({
          text: '房间里有什么设备',
          kind: 'agent_message',
          device: null,
          action: null,
          room: null,
          query: {
            type: 'room_devices',
            roomId: null,
            reason: 'ask room devices',
          },
        }),
      ),
    };

    const orchestrator = new VoiceCommandOrchestrator(
      intentService as never,
      { getRoomAgentByRoomId: jest.fn(), destroy: jest.fn() } as never,
      { destroy: jest.fn(async () => undefined) } as never,
      { sendTask: jest.fn(async () => true) } as never,
    );

    const result = await orchestrator.execute('房间里有什么设备');

    expect(result).toMatchObject({
      success: false,
      route: 'unresolved',
      status: '缺少房间上下文',
    });
  });

  it('returns a graceful degraded query reply when the room-agent query response is empty', async () => {
    const intentService = {
      parse: jest.fn(async () =>
        createIntent({
          text: '房间里有什么设备',
          kind: 'agent_message',
          device: null,
          action: null,
          query: {
            type: 'room_devices',
            roomId: 'livingroom',
            reason: 'ask room devices',
          },
        }),
      ),
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
      queryRoomDevices: jest.fn(async () => ({
        success: true,
        taskId: null,
        contextId: 'ctx-query-devices-empty',
        state: 'completed',
        isTerminal: true,
        isInterrupted: false,
        detail: '',
        action: null,
      })),
      queryCapabilities: jest.fn(),
      sendControl: jest.fn(),
      destroy: jest.fn(async () => undefined),
      getLastError: jest.fn(() => null),
    };

    const orchestrator = new VoiceCommandOrchestrator(
      intentService as never,
      discoveryService as never,
      controlService as never,
      { sendTask: jest.fn(async () => true) } as never,
    );

    const result = await orchestrator.execute('房间里有什么设备');

    expect(result).toMatchObject({
      success: true,
      route: 'query',
      status: '已收到房间设备信息',
      detail: '客厅已连上 Room-Agent，但暂未收到设备清单回复。',
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
        }),
      ),
    };
    const homeAgentService = {
      sendTask: jest.fn(async () => true),
    };

    const orchestrator = new VoiceCommandOrchestrator(
      intentService as never,
      { getRoomAgentByRoomId: jest.fn(), destroy: jest.fn() } as never,
      { destroy: jest.fn(async () => undefined) } as never,
      homeAgentService as never,
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
      { sendTask: jest.fn(async () => true) } as never,
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

  it('surfaces completed room-agent task details when the transport finishes synchronously', async () => {
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
      sendControl: jest.fn(async () => ({
        success: true,
        taskId: 'task-2',
        state: 'completed',
        isTerminal: true,
        isInterrupted: false,
        detail: '客厅主灯已打开',
      })),
      destroy: jest.fn(async () => undefined),
    };

    const orchestrator = new VoiceCommandOrchestrator(
      intentService as never,
      discoveryService as never,
      controlService as never,
      { sendTask: jest.fn(async () => true) } as never,
    );

    const result = await orchestrator.execute('打开客厅主灯');

    expect(result).toMatchObject({
      success: true,
      route: 'room-agent',
      status: 'Room-Agent 已完成执行',
      detail: '客厅主灯已打开',
      taskState: 'completed',
      taskTerminal: true,
    });
  });

  it('surfaces the transport probe error when room-agent connection fails', async () => {
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
      connect: jest.fn(async () => false),
      getLastError: jest.fn(() => '无法访问 room-agent agent-card: http://127.0.0.1:8001/a2a'),
      destroy: jest.fn(async () => undefined),
    };

    const orchestrator = new VoiceCommandOrchestrator(
      intentService as never,
      discoveryService as never,
      controlService as never,
      { sendTask: jest.fn(async () => true) } as never,
    );

    const result = await orchestrator.execute('打开客厅主灯');

    expect(result).toMatchObject({
      success: false,
      route: 'room-agent',
      status: '控制通道连接失败',
    });
    expect(result.detail).toContain('agent-card');
  });

  it('surfaces interrupted room-agent tasks as action-required instead of completed', async () => {
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
      sendControl: jest.fn(async () => ({
        success: true,
        taskId: 'task-3',
        state: 'input-required',
        isTerminal: false,
        isInterrupted: true,
        detail: '请补充亮度值。',
      })),
      destroy: jest.fn(async () => undefined),
    };

    const orchestrator = new VoiceCommandOrchestrator(
      intentService as never,
      discoveryService as never,
      controlService as never,
      { sendTask: jest.fn(async () => true) } as never,
    );

    const result = await orchestrator.execute('打开客厅主灯');

    expect(result).toMatchObject({
      success: true,
      route: 'room-agent',
      status: 'Room-Agent 等待补充输入',
      detail: '请补充亮度值。',
      taskState: 'input-required',
      taskTerminal: false,
      taskInterrupted: true,
    });
  });

  it('prefers the resolved room name over the current binding fallback', async () => {
    const intentService = {
      parse: jest.fn(async () =>
        createIntent({
          room: 'bedroom',
          device: null,
        }),
      ),
    };
    const orchestrator = new VoiceCommandOrchestrator(
      intentService as never,
      { getRoomAgentByRoomId: jest.fn(), destroy: jest.fn() } as never,
      { destroy: jest.fn(async () => undefined) } as never,
      { sendTask: jest.fn(async () => true) } as never,
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
      status: '未发现 Room-Agent',
      route: 'room-agent',
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
        }),
      ),
    };
    const orchestrator = new VoiceCommandOrchestrator(
      intentService as never,
      { getRoomAgentByRoomId: jest.fn(), destroy: jest.fn() } as never,
      { destroy: jest.fn(async () => undefined) } as never,
      { sendTask: jest.fn(async () => true) } as never,
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
      status: '未发现 Room-Agent',
      route: 'room-agent',
      roomId: 'bedroom',
      roomName: '卧室',
    });
  });
});
