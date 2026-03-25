import { DiscoveryService } from '@/services/discovery-service';

describe('DiscoveryService', () => {
  it('maps beacon discovery responses into the app domain model', async () => {
    const http = {
      get: jest.fn(async () => ({
        success: true,
        data: {
          beacon_id: '1',
          room_id: 'livingroom',
          room_name: '客厅',
          agent_id: 'room-agent-livingroom',
          url: 'http://127.0.0.1:8001',
          mqtt_broker: 'broker.local',
          mqtt_ws_port: 9002,
          capabilities: ['lighting'],
          devices: [{ id: 'ceiling_light', name: '吊灯', type: 'light' }],
        },
      })),
    };

    const service = new DiscoveryService(http as never);
    const result = await service.getRoomAgentByBeacon('1');

    expect(result).toEqual({
      beaconId: '1',
      roomId: 'livingroom',
      roomName: '客厅',
      agentId: 'room-agent-livingroom',
      url: 'http://127.0.0.1:8001',
      mqttBroker: 'broker.local',
      mqttWsPort: 9002,
      capabilities: ['lighting'],
      devices: [{ id: 'ceiling_light', name: '吊灯', type: 'light' }],
      metadata: expect.any(Object),
    });
  });

  it('returns a cached result for repeated beacon lookups', async () => {
    const http = {
      get: jest.fn(async () => ({
        success: true,
        data: {
          beacon_id: '2',
          room_id: 'bedroom',
          agent_id: 'room-agent-bedroom',
        },
      })),
    };

    const service = new DiscoveryService(http as never);
    await service.getRoomAgentByBeacon('2');
    await service.getRoomAgentByBeacon('2');

    expect(http.get).toHaveBeenCalledTimes(1);
  });
});
