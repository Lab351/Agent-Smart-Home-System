import { A2AHttpControlTransport } from '@/services/transports/a2a-http-control-transport';
import type { ControlTaskStateUpdate } from '@/types';

function createAgentCard(overrides: Record<string, unknown> = {}) {
  return {
    name: 'RoomAgent',
    version: '0.1.0',
    protocolVersion: '0.3.0',
    url: 'http://127.0.0.1:8001',
    capabilities: {
      streaming: false,
      pushNotifications: false,
    },
    skills: [
      {
        id: 'lighting',
        name: 'Lighting',
        description: 'Control room lighting',
        tags: ['lighting'],
      },
    ],
    ...overrides,
  };
}

describe('A2AHttpControlTransport', () => {
  it('only marks the transport connected after agent-card probing succeeds', async () => {
    const adapter = {
      createSession: jest.fn(async () => ({
        client: {} as never,
        serviceBaseUrl: 'http://127.0.0.1:8001',
        agentCardUrl: 'http://127.0.0.1:8001/.well-known/agent-card.json',
        agentCard: createAgentCard(),
      })),
      getAgentCard: jest.fn(),
      sendMessage: jest.fn(),
      getTask: jest.fn(),
    };
    const transport = new A2AHttpControlTransport(adapter as never);

    const connected = await transport.connect({
      personalAgentId: 'personal-agent-user1',
      roomId: 'livingroom',
      roomAgentId: 'room-agent-livingroom',
      agentInfo: {
        beaconId: '1',
        roomId: 'livingroom',
        roomName: '客厅',
        agentId: 'room-agent-livingroom',
        url: 'http://127.0.0.1:8001/a2a',
        devices: [],
        capabilities: ['lighting'],
      },
    });

    expect(adapter.createSession).toHaveBeenCalledWith('http://127.0.0.1:8001/a2a');
    expect(connected).toBe(true);
    expect(transport.isConnected()).toBe(true);
    expect(transport.getLastError()).toBeNull();
  });

  it('returns a connection error when the agent-card probe fails', async () => {
    const adapter = {
      createSession: jest.fn(async () => {
        throw new Error('timeout');
      }),
      getAgentCard: jest.fn(),
      sendMessage: jest.fn(),
      getTask: jest.fn(),
    };
    const transport = new A2AHttpControlTransport(adapter as never);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    const connected = await transport.connect({
      personalAgentId: 'personal-agent-user1',
      roomId: 'livingroom',
      roomAgentId: 'room-agent-livingroom',
      agentInfo: {
        beaconId: '1',
        roomId: 'livingroom',
        roomName: '客厅',
        agentId: 'room-agent-livingroom',
        url: 'http://127.0.0.1:8001/a2a',
        devices: [],
        capabilities: ['lighting'],
      },
    });

    expect(connected).toBe(false);
    expect(transport.isConnected()).toBe(false);
    expect(transport.getLastError()).toContain('agent-card');

    warnSpy.mockRestore();
  });

  it('sends text messages and emits polled task updates until completed', async () => {
    let pollCount = 0;
    const adapter = {
      createSession: jest.fn(async () => ({
        client: {} as never,
        serviceBaseUrl: 'http://127.0.0.1:8001',
        agentCardUrl: 'http://127.0.0.1:8001/.well-known/agent-card.json',
        agentCard: createAgentCard(),
      })),
      getAgentCard: jest.fn(),
      sendMessage: jest.fn(async (_client, params) => {
        expect(params.message.parts).toEqual([
          expect.objectContaining({
            kind: 'text',
            text: '打开客厅主灯亮度调到80',
          }),
        ]);
        expect(params.message.metadata).toEqual(
          expect.objectContaining({
            controlRequest: expect.objectContaining({
              roomId: 'livingroom',
              targetDevice: 'main_light',
              action: 'turn_on',
              parameters: { brightness: 80 },
            }),
          })
        );
        expect(params.message.metadata.controlRequest).not.toHaveProperty('controlRequest');

        return {
          kind: 'task',
          id: 'task-1',
          status: {
            state: 'submitted',
          },
        };
      }),
      getTask: jest.fn(async () => {
        pollCount += 1;
        return {
          kind: 'task',
          id: 'task-1',
          status: {
            state: pollCount >= 2 ? 'completed' : 'working',
            message: {
              kind: 'message',
              messageId: `task-msg-${pollCount}`,
              role: 'agent',
              parts: [
                {
                  kind: 'text',
                  text: pollCount >= 2 ? '任务执行完成' : '任务执行中',
                },
              ],
            },
          },
          artifacts:
            pollCount >= 2
              ? [
                  {
                    artifactId: 'artifact-1',
                    parts: [
                      {
                        kind: 'text',
                        text: '任务执行完成',
                      },
                    ],
                  },
                ]
              : [],
        };
      }),
    };
    const transport = new A2AHttpControlTransport(adapter as never, {
      pollIntervalMs: 0,
      maxPollAttempts: 3,
    });
    const stateUpdates: string[] = [];

    await transport.connect({
      personalAgentId: 'personal-agent-user1',
      roomId: 'livingroom',
      roomAgentId: 'room-agent-livingroom',
      agentInfo: {
        beaconId: '1',
        roomId: 'livingroom',
        roomName: '客厅',
        agentId: 'room-agent-livingroom',
        url: 'http://127.0.0.1:8001/a2a',
        devices: [],
        capabilities: ['lighting'],
      },
    });

    const dispatch = await transport.sendControl({
      roomId: 'livingroom',
      roomAgentId: 'room-agent-livingroom',
      utterance: '打开客厅主灯亮度调到80',
      sourceAgent: 'personal-agent-user1',
      targetDevice: 'main_light',
      action: 'turn_on',
      parameters: { brightness: 80 },
    });

    expect(dispatch).toMatchObject({
      success: true,
      taskId: 'task-1',
      state: 'submitted',
      isTerminal: false,
      isInterrupted: false,
    });

    await transport.subscribeToState('livingroom', state => {
      stateUpdates.push(`${state.state}:${state.detail}`);
    });

    await new Promise(resolve => setTimeout(resolve, 0));
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(stateUpdates).toContain('submitted:Room-Agent 已接收控制请求，等待开始执行。');
    expect(stateUpdates).toContain('working:任务执行中');
    expect(stateUpdates).toContain('completed:任务执行完成');
  });

  it('returns an immediate response when the agent replies with a message', async () => {
    const adapter = {
      createSession: jest.fn(async () => ({
        client: {} as never,
        serviceBaseUrl: 'http://127.0.0.1:8001',
        agentCardUrl: 'http://127.0.0.1:8001/.well-known/agent-card.json',
        agentCard: createAgentCard(),
      })),
      getAgentCard: jest.fn(),
      sendMessage: jest.fn(async () => ({
        kind: 'message',
        messageId: 'reply-1',
        role: 'agent',
        parts: [{ kind: 'text', text: '客厅主灯已打开' }],
      })),
      getTask: jest.fn(),
    };
    const transport = new A2AHttpControlTransport(adapter as never);

    await transport.connect({
      personalAgentId: 'personal-agent-user1',
      roomId: 'livingroom',
      roomAgentId: 'room-agent-livingroom',
      agentInfo: {
        beaconId: '1',
        roomId: 'livingroom',
        roomName: '客厅',
        agentId: 'room-agent-livingroom',
        url: 'http://127.0.0.1:8001',
        devices: [],
        capabilities: ['lighting'],
      },
    });

    const dispatch = await transport.sendControl({
      roomId: 'livingroom',
      roomAgentId: 'room-agent-livingroom',
      utterance: '打开客厅主灯',
      sourceAgent: 'personal-agent-user1',
      targetDevice: 'main_light',
      action: 'turn_on',
      parameters: {},
    });

    expect(dispatch).toMatchObject({
      success: true,
      taskId: null,
      state: 'completed',
      isTerminal: true,
      isInterrupted: false,
      detail: '客厅主灯已打开',
    });
  });

  it('marks the task unknown after repeated polling failures', async () => {
    const adapter = {
      createSession: jest.fn(async () => ({
        client: {} as never,
        serviceBaseUrl: 'http://127.0.0.1:8001',
        agentCardUrl: 'http://127.0.0.1:8001/.well-known/agent-card.json',
        agentCard: createAgentCard(),
      })),
      getAgentCard: jest.fn(),
      sendMessage: jest.fn(async () => ({
        kind: 'task',
        id: 'task-1',
        status: {
          state: 'submitted',
        },
      })),
      getTask: jest.fn(async () => {
        throw new Error('network down');
      }),
    };
    const transport = new A2AHttpControlTransport(adapter as never, {
      pollIntervalMs: 0,
      maxPollAttempts: 2,
    });
    const stateUpdates: string[] = [];

    await transport.connect({
      personalAgentId: 'personal-agent-user1',
      roomId: 'livingroom',
      roomAgentId: 'room-agent-livingroom',
      agentInfo: {
        beaconId: '1',
        roomId: 'livingroom',
        roomName: '客厅',
        agentId: 'room-agent-livingroom',
        url: 'http://127.0.0.1:8001',
        devices: [],
        capabilities: ['lighting'],
      },
    });

    await transport.subscribeToState('livingroom', state => {
      stateUpdates.push(`${state.state}:${state.detail}`);
    });

    await transport.sendControl({
      roomId: 'livingroom',
      roomAgentId: 'room-agent-livingroom',
      utterance: '打开客厅主灯',
      sourceAgent: 'personal-agent-user1',
      targetDevice: 'main_light',
      action: 'turn_on',
      parameters: {},
    });

    await new Promise(resolve => setTimeout(resolve, 0));
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(stateUpdates[stateUpdates.length - 1]).toContain(
      'unknown:Room-Agent 任务状态查询超时或失败: network down'
    );
  });

  it('stops polling when the task enters an interrupted state', async () => {
    const adapter = {
      createSession: jest.fn(async () => ({
        client: {} as never,
        serviceBaseUrl: 'http://127.0.0.1:8001',
        agentCardUrl: 'http://127.0.0.1:8001/.well-known/agent-card.json',
        agentCard: createAgentCard(),
      })),
      getAgentCard: jest.fn(),
      sendMessage: jest.fn(async () => ({
        kind: 'task',
        id: 'task-need-input',
        status: {
          state: 'submitted',
        },
      })),
      getTask: jest.fn(async () => ({
        kind: 'task',
        id: 'task-need-input',
        status: {
          state: 'input-required',
          message: {
            kind: 'message',
            messageId: 'task-msg-input',
            role: 'agent',
            parts: [{ kind: 'text', text: '请补充亮度值。' }],
          },
        },
      })),
    };
    const transport = new A2AHttpControlTransport(adapter as never, {
      pollIntervalMs: 0,
      maxPollAttempts: 3,
    });
    const states: ControlTaskStateUpdate[] = [];

    await transport.connect({
      personalAgentId: 'personal-agent-user1',
      roomId: 'livingroom',
      roomAgentId: 'room-agent-livingroom',
      agentInfo: {
        beaconId: '1',
        roomId: 'livingroom',
        roomName: '客厅',
        agentId: 'room-agent-livingroom',
        url: 'http://127.0.0.1:8001',
        devices: [],
        capabilities: ['lighting'],
      },
    });

    await transport.subscribeToState('livingroom', state => {
      states.push(state);
    });

    const dispatch = await transport.sendControl({
      roomId: 'livingroom',
      roomAgentId: 'room-agent-livingroom',
      utterance: '打开客厅主灯',
      sourceAgent: 'personal-agent-user1',
      targetDevice: 'main_light',
      action: 'turn_on',
      parameters: {},
    });

    await new Promise(resolve => setTimeout(resolve, 0));
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(dispatch).toMatchObject({
      success: true,
      state: 'submitted',
      isTerminal: false,
      isInterrupted: false,
    });
    expect(states[states.length - 1]).toMatchObject({
      state: 'input-required',
      isTerminal: false,
      isInterrupted: true,
      detail: '请补充亮度值。',
    });
    expect(adapter.getTask).toHaveBeenCalledTimes(1);
  });

  it('continues an interrupted task with the same task and context ids', async () => {
    const adapter = {
      createSession: jest.fn(async () => ({
        client: {} as never,
        serviceBaseUrl: 'http://127.0.0.1:8001',
        agentCardUrl: 'http://127.0.0.1:8001/.well-known/agent-card.json',
        agentCard: createAgentCard(),
      })),
      getAgentCard: jest.fn(),
      sendMessage: jest.fn(async (_client, params) => {
        expect(params.message.taskId).toBe('task-need-input');
        expect(params.message.contextId).toBe('ctx-need-input');
        expect(params.message.parts).toEqual([
          expect.objectContaining({
            kind: 'text',
            text: '亮度改成 80%',
          }),
        ]);

        return {
          kind: 'task',
          id: 'task-need-input',
          contextId: 'ctx-need-input',
          status: {
            state: 'working',
            message: {
              kind: 'message',
              messageId: 'task-msg-working',
              role: 'agent',
              parts: [{ kind: 'text', text: '已收到补充输入，继续执行。' }],
            },
          },
        };
      }),
      getTask: jest.fn(async () => ({
        kind: 'task',
        id: 'task-need-input',
        contextId: 'ctx-need-input',
        status: {
          state: 'completed',
          message: {
            kind: 'message',
            messageId: 'task-msg-done',
            role: 'agent',
            parts: [{ kind: 'text', text: '客厅主灯亮度已调到 80%。' }],
          },
        },
      })),
    };
    const transport = new A2AHttpControlTransport(adapter as never, {
      pollIntervalMs: 0,
      maxPollAttempts: 2,
    });

    await transport.connect({
      personalAgentId: 'personal-agent-user1',
      roomId: 'livingroom',
      roomAgentId: 'room-agent-livingroom',
      agentInfo: {
        beaconId: '1',
        roomId: 'livingroom',
        roomName: '客厅',
        agentId: 'room-agent-livingroom',
        url: 'http://127.0.0.1:8001',
        devices: [],
        capabilities: ['lighting'],
      },
    });

    const dispatch = await transport.sendControl({
      roomId: 'livingroom',
      roomAgentId: 'room-agent-livingroom',
      utterance: '亮度改成 80%',
      sourceAgent: 'personal-agent-user1',
      targetDevice: 'main_light',
      action: 'turn_on',
      parameters: { brightness: 80 },
      taskId: 'task-need-input',
      contextId: 'ctx-need-input',
    });

    expect(dispatch).toMatchObject({
      success: true,
      taskId: 'task-need-input',
      contextId: 'ctx-need-input',
      state: 'working',
      isTerminal: false,
      isInterrupted: false,
      detail: '已收到补充输入，继续执行。',
    });
  });

  it('extracts auth action links from interrupted task payloads', async () => {
    const adapter = {
      createSession: jest.fn(async () => ({
        client: {} as never,
        serviceBaseUrl: 'http://127.0.0.1:8001',
        agentCardUrl: 'http://127.0.0.1:8001/.well-known/agent-card.json',
        agentCard: createAgentCard(),
      })),
      getAgentCard: jest.fn(),
      sendMessage: jest.fn(async () => ({
        kind: 'task',
        id: 'task-auth',
        contextId: 'ctx-auth',
        status: {
          state: 'auth-required',
          message: {
            kind: 'message',
            messageId: 'task-msg-auth',
            role: 'agent',
            parts: [
              {
                kind: 'text',
                text: '请先完成鉴权后继续。',
              },
              {
                kind: 'data',
                data: {
                  authUrl: 'https://auth.example.com/authorize',
                  label: '打开鉴权页面',
                  callbackUrl: 'personalagent://voice-control?auth=done',
                },
              },
            ],
          },
        },
      })),
      getTask: jest.fn(),
    };
    const transport = new A2AHttpControlTransport(adapter as never);

    await transport.connect({
      personalAgentId: 'personal-agent-user1',
      roomId: 'livingroom',
      roomAgentId: 'room-agent-livingroom',
      agentInfo: {
        beaconId: '1',
        roomId: 'livingroom',
        roomName: '客厅',
        agentId: 'room-agent-livingroom',
        url: 'http://127.0.0.1:8001',
        devices: [],
        capabilities: ['lighting'],
      },
    });

    const dispatch = await transport.sendControl({
      roomId: 'livingroom',
      roomAgentId: 'room-agent-livingroom',
      utterance: '打开客厅主灯',
      sourceAgent: 'personal-agent-user1',
      targetDevice: 'main_light',
      action: 'turn_on',
      parameters: {},
    });

    expect(dispatch).toMatchObject({
      success: true,
      taskId: 'task-auth',
      contextId: 'ctx-auth',
      state: 'auth-required',
      isTerminal: false,
      isInterrupted: true,
      action: {
        kind: 'auth',
        label: '打开鉴权页面',
        url: 'https://auth.example.com/authorize',
        callbackUrl: 'personalagent://voice-control?auth=done',
      },
    });
  });

  it('maps canonical agent-card metadata into the room snapshot payload', async () => {
    const adapter = {
      createSession: jest.fn(async () => ({
        client: {} as never,
        serviceBaseUrl: 'http://127.0.0.1:8001',
        agentCardUrl: 'http://127.0.0.1:8001/.well-known/agent-card.json',
        agentCard: createAgentCard({
          description: 'Controls living room devices',
          version: '1.2.0',
          skills: [
            {
              id: 'lighting',
              name: 'Lighting',
              description: 'Control room lighting',
              tags: ['lighting', 'brightness'],
            },
          ],
          metadata: {
            agent_type: 'room',
          },
        }),
      })),
      getAgentCard: jest.fn(async () =>
        createAgentCard({
          description: 'Controls living room devices',
          version: '1.2.0',
          skills: [
            {
              id: 'lighting',
              name: 'Lighting',
              description: 'Control room lighting',
              tags: ['lighting', 'brightness'],
            },
          ],
          metadata: {
            agent_type: 'room',
          },
        })
      ),
      sendMessage: jest.fn(),
      getTask: jest.fn(),
    };
    const transport = new A2AHttpControlTransport(adapter as never);
    const descriptions: Record<string, unknown>[] = [];

    await transport.connect({
      personalAgentId: 'personal-agent-user1',
      roomId: 'livingroom',
      roomAgentId: 'room-agent-livingroom',
      agentInfo: {
        beaconId: '1',
        roomId: 'livingroom',
        roomName: '客厅',
        agentId: 'room-agent-livingroom',
        url: 'http://127.0.0.1:8001',
        devices: [],
        capabilities: ['lighting'],
      },
    });

    await transport.subscribeToDescription('livingroom', description => {
      descriptions.push(description as Record<string, unknown>);
    });
    await transport.queryCapabilities({
      roomId: 'livingroom',
      roomAgentId: 'room-agent-livingroom',
      sourceAgent: 'personal-agent-user1',
      agentInfo: {
        beaconId: '1',
        roomId: 'livingroom',
        roomName: '客厅',
        agentId: 'room-agent-livingroom',
        url: 'http://127.0.0.1:8001',
        devices: [],
        capabilities: ['lighting'],
      },
    });

    expect(descriptions[descriptions.length - 1]).toMatchObject({
      room_id: 'livingroom',
      room_name: '客厅',
      agent_id: 'room-agent-livingroom',
      agent_name: 'RoomAgent',
      agent_type: 'room',
      agent_description: 'Controls living room devices',
      agent_version: '1.2.0',
      capabilities: expect.arrayContaining(['lighting', 'brightness']),
      skills: [
        expect.objectContaining({
          id: 'lighting',
          name: 'Lighting',
        }),
      ],
    });
  });

  it('preserves discovery fallback devices and capabilities when refreshing a placeholder agent-card', async () => {
    const adapter = {
      createSession: jest.fn(async () => ({
        client: {} as never,
        serviceBaseUrl: 'http://127.0.0.1:8001',
        agentCardUrl: 'http://127.0.0.1:8001/.well-known/agent-card.json',
        agentCard: createAgentCard(),
      })),
      getAgentCard: jest.fn(async () =>
        createAgentCard({
          skills: [],
          capabilities: {
            streaming: false,
            pushNotifications: false,
          },
        })
      ),
      sendMessage: jest.fn(),
      getTask: jest.fn(),
    };
    const transport = new A2AHttpControlTransport(adapter as never);
    const descriptions: Record<string, unknown>[] = [];

    await transport.connect({
      personalAgentId: 'personal-agent-user1',
      roomId: 'livingroom',
      roomAgentId: 'room-agent-livingroom',
      agentInfo: {
        beaconId: '1',
        roomId: 'livingroom',
        roomName: '客厅',
        agentId: 'room-agent-livingroom',
        url: 'http://127.0.0.1:8001',
        devices: [
          {
            id: 'main_light',
            name: '客厅主灯',
            type: 'light',
          },
        ],
        capabilities: ['lighting', 'brightness'],
      },
    });

    await transport.subscribeToDescription('livingroom', description => {
      descriptions.push(description as Record<string, unknown>);
    });
    await transport.queryCapabilities({
      roomId: 'livingroom',
      roomAgentId: 'room-agent-livingroom',
      sourceAgent: 'personal-agent-user1',
    });

    expect(descriptions[descriptions.length - 1]).toMatchObject({
      room_id: 'livingroom',
      room_name: '客厅',
      devices: [
        expect.objectContaining({
          id: 'main_light',
          name: '客厅主灯',
          type: 'light',
        }),
      ],
      capabilities: expect.arrayContaining(['lighting', 'brightness']),
    });
  });
});
