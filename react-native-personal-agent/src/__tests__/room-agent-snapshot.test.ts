import { buildRoomAgentSnapshot } from '@/features/voice-control/room-agent-snapshot';

describe('buildRoomAgentSnapshot', () => {
  it('builds a readable snapshot from agent-card shaped data', () => {
    const snapshot = buildRoomAgentSnapshot(
      {
        agent_id: 'room-agent-livingroom',
        agent_type: 'room',
        devices: [
          { id: 'main-light', name: '客厅主灯', type: 'light' },
          { id: 'curtain-1', type: 'curtain' },
        ],
        capabilities: ['lighting', 'curtain'],
      },
      {
        roomId: 'livingroom',
        roomName: '客厅',
        updatedAt: 1_234,
      }
    );

    expect(snapshot).toEqual({
      roomId: 'livingroom',
      roomName: '客厅',
      agentId: 'room-agent-livingroom',
      agentName: null,
      agentType: 'room',
      agentDescription: null,
      agentVersion: null,
      devices: [
        { id: 'main-light', name: '客厅主灯', type: 'light' },
        { id: 'curtain-1', name: 'curtain-1', type: 'curtain' },
      ],
      capabilities: ['lighting', 'curtain'],
      skills: [],
      note: '已从 agent-card 读取 2 个设备、2 类能力、0 个技能；这是一份代理描述快照，不等于实时设备状态。',
      updatedAt: 1_234,
      raw: {
        agent_id: 'room-agent-livingroom',
        agent_type: 'room',
        devices: [
          { id: 'main-light', name: '客厅主灯', type: 'light' },
          { id: 'curtain-1', type: 'curtain' },
        ],
        capabilities: ['lighting', 'curtain'],
      },
    });
  });

  it('returns null for non-object payloads', () => {
    expect(buildRoomAgentSnapshot(null)).toBeNull();
    expect(buildRoomAgentSnapshot('invalid')).toBeNull();
  });

  it('keeps an empty-state note when the payload has no visible devices or capabilities', () => {
    const snapshot = buildRoomAgentSnapshot({ agent_id: 'room-agent-empty' });

    expect(snapshot).toMatchObject({
      agentId: 'room-agent-empty',
      devices: [],
      capabilities: [],
      skills: [],
      note: '已连接 Room-Agent，但当前 agent-card 没有返回可展示的设备或能力信息。',
    });
  });

  it('uses room context carried by the description payload when explicit context is absent', () => {
    const snapshot = buildRoomAgentSnapshot({
      room_id: 'livingroom',
      room_name: '客厅',
      agent_id: 'room-agent-livingroom',
    });

    expect(snapshot).toMatchObject({
      roomId: 'livingroom',
      roomName: '客厅',
      agentId: 'room-agent-livingroom',
    });
  });

  it('derives a readable snapshot from a standard A2A agent-card payload', () => {
    const snapshot = buildRoomAgentSnapshot(
      {
        name: 'Living Room Agent',
        description: 'Controls lighting and curtains in the living room.',
        version: '1.2.0',
        capabilities: {
          streaming: true,
          pushNotifications: false,
          stateTransitionHistory: true,
        },
        skills: [
          {
            id: 'lighting',
            name: 'Lighting Control',
            description: 'Turn lights on or off',
            tags: ['light', 'brightness'],
          },
          {
            id: 'curtain',
            name: 'Curtain Control',
            tags: ['shade'],
          },
        ],
        metadata: {
          agent_type: 'room',
        },
      },
      {
        roomId: 'livingroom',
        roomName: '客厅',
        updatedAt: 2_468,
      }
    );

    expect(snapshot).toEqual({
      roomId: 'livingroom',
      roomName: '客厅',
      agentId: null,
      agentName: 'Living Room Agent',
      agentType: 'room',
      agentDescription: 'Controls lighting and curtains in the living room.',
      agentVersion: '1.2.0',
      devices: [],
      capabilities: [
        'streaming',
        'state-transition-history',
        'lighting',
        'light',
        'brightness',
        'curtain',
        'shade',
      ],
      skills: [
        {
          id: 'lighting',
          name: 'Lighting Control',
          description: 'Turn lights on or off',
          tags: ['light', 'brightness'],
        },
        {
          id: 'curtain',
          name: 'Curtain Control',
          description: null,
          tags: ['shade'],
        },
      ],
      note: '已从 agent-card 读取 0 个设备、7 类能力、2 个技能；这是一份代理描述快照，不等于实时设备状态。',
      updatedAt: 2_468,
      raw: {
        name: 'Living Room Agent',
        description: 'Controls lighting and curtains in the living room.',
        version: '1.2.0',
        capabilities: {
          streaming: true,
          pushNotifications: false,
          stateTransitionHistory: true,
        },
        skills: [
          {
            id: 'lighting',
            name: 'Lighting Control',
            description: 'Turn lights on or off',
            tags: ['light', 'brightness'],
          },
          {
            id: 'curtain',
            name: 'Curtain Control',
            tags: ['shade'],
          },
        ],
        metadata: {
          agent_type: 'room',
        },
      },
    });
  });
});
