import { buildDashboardModel } from '@/features/dashboard/dashboard-data';

describe('buildDashboardModel', () => {
  it('summarizes endpoints and room mappings for the dashboard', () => {
    const model = buildDashboardModel({
      backendUrl: 'http://120.78.228.69:3088',
      mqttHost: 'broker.local',
      mqttWsPort: 9002,
      roomCount: 4,
      platform: 'android',
    });

    expect(model.stats[0]).toMatchObject({
      label: '后端发现服务',
      value: '120.78.228.69:3088',
    });
    expect(model.stats[2]).toMatchObject({
      value: '4 个房间',
      tone: 'success',
    });
    expect(model.todayPlan.map(item => item.status)).toEqual([
      'active',
      'active',
      'pending',
      'blocked',
    ]);
  });
});
