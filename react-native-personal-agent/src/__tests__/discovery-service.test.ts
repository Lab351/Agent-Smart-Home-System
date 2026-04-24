import { DiscoveryService } from '@/services/discovery-service';

describe('DiscoveryService', () => {
  it('enriches beacon discovery responses with registry agent card data', async () => {
    const http = {
      get: jest.fn(async (path: string) => {
        if (path === '/api/beacon/1') {
          return {
            success: true,
            data: {
              beacon_id: '1',
              room_id: 'livingroom',
              room_name: '客厅',
              agent_id: 'room-agent-livingroom',
            },
          };
        }

        if (path === '/api/registry/discover?agent_id=room-agent-livingroom') {
          return {
            success: true,
            data: [
              {
                id: 'room-agent-livingroom',
                name: 'livingroom RoomAgent',
                agent_type: 'room',
                url: 'http://127.0.0.1:8001',
                documentation_url: 'http://127.0.0.1:8001/.well-known/agent-card.json',
                capabilities: ['lighting'],
                devices: [{ id: 'ceiling_light', name: '吊灯', type: 'light' }],
                metadata: { room_id: 'livingroom', beacon_id: '1' },
              },
            ],
          };
        }

        throw new Error(`Unexpected path: ${path}`);
      }),
    };

    const service = new DiscoveryService(http as never);
    const result = await service.getRoomAgentByBeacon('1');

    expect(http.get).toHaveBeenCalledWith('/api/beacon/1');
    expect(http.get).toHaveBeenCalledWith('/api/registry/discover?agent_id=room-agent-livingroom');
    expect(result).toMatchObject({
      beaconId: '1',
      roomId: 'livingroom',
      roomName: '客厅',
      agentId: 'room-agent-livingroom',
      agentName: 'livingroom RoomAgent',
      agentType: 'room',
      url: 'http://127.0.0.1:8001',
      documentationUrl: 'http://127.0.0.1:8001/.well-known/agent-card.json',
      capabilities: ['lighting'],
      devices: [{ id: 'ceiling_light', name: '吊灯', type: 'light' }],
      metadata: {
        beacon_id: '1',
        room_id: 'livingroom',
        room_name: '客厅',
        agent_id: 'room-agent-livingroom',
        registry: expect.objectContaining({
          id: 'room-agent-livingroom',
          url: 'http://127.0.0.1:8001',
        }),
      },
    });
  });

  it('returns a cached result for repeated beacon lookups', async () => {
    const http = {
      get: jest.fn(async (path: string) => {
        if (path === '/api/beacon/2') {
          return {
            success: true,
            data: {
              beacon_id: '2',
              room_id: 'bedroom',
              agent_id: 'room-agent-bedroom',
            },
          };
        }

        return {
          success: true,
          data: [],
        };
      }),
    };

    const service = new DiscoveryService(http as never);
    await service.getRoomAgentByBeacon('2');
    await service.getRoomAgentByBeacon('2');

    expect(http.get).toHaveBeenCalledTimes(2);
    expect(http.get).toHaveBeenCalledWith('/api/beacon/2');
    expect(http.get).toHaveBeenCalledWith('/api/registry/discover?agent_id=room-agent-bedroom');
  });

  it('keeps beacon mapping when registry returns no matching agent', async () => {
    const http = {
      get: jest.fn(async (path: string) => {
        if (path === '/api/beacon/room/bedroom') {
          return {
            success: true,
            data: {
              beacon_id: '3',
              room_id: 'bedroom',
              agent_id: 'room-agent-bedroom',
              capabilities: ['device_control'],
              devices: [],
            },
          };
        }

        if (path === '/api/registry/discover?agent_id=room-agent-bedroom') {
          return {
            success: true,
            data: [],
          };
        }

        throw new Error(`Unexpected path: ${path}`);
      }),
    };

    const service = new DiscoveryService(http as never);
    const result = await service.getRoomAgentByRoomId('bedroom');

    expect(result).toMatchObject({
      beaconId: '3',
      roomId: 'bedroom',
      roomName: '卧室',
      agentId: 'room-agent-bedroom',
      url: null,
      documentationUrl: null,
      capabilities: ['device_control'],
      devices: [],
    });
  });
});
