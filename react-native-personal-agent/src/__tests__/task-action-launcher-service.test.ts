import type { ControlTaskAction } from '@/types';
import { TaskActionLauncherService } from '@/services/task-action-launcher-service';

function createAction(overrides: Partial<ControlTaskAction> = {}): ControlTaskAction {
  return {
    kind: 'auth',
    label: '打开鉴权页面',
    description: '请先完成鉴权',
    url: 'https://auth.example.com/authorize',
    callbackUrl: 'personalagent://voice-control?auth=done',
    ...overrides,
  };
}

describe('TaskActionLauncherService', () => {
  it('uses auth sessions for http auth flows that provide an app callback url', async () => {
    const linking = {
      canOpenURL: jest.fn(async () => true),
      openURL: jest.fn(async () => undefined),
      parse: jest.fn(url => ({
        hostname: 'voice-control',
        path: 'resume',
        queryParams: {
          auth: 'done',
          state: 'xyz',
        },
      })),
    };
    const webBrowser = {
      openAuthSessionAsync: jest.fn(async () => ({
        type: 'success',
        url: 'personalagent://voice-control?auth=done',
      })),
      openBrowserAsync: jest.fn(async () => ({ type: 'opened' })),
      WebBrowserPresentationStyle: {
        AUTOMATIC: 1,
      },
    };
    const service = new TaskActionLauncherService(linking as never, webBrowser as never);

    const result = await service.open(createAction());

    expect(webBrowser.openAuthSessionAsync).toHaveBeenCalledWith(
      'https://auth.example.com/authorize',
      'personalagent://voice-control?auth=done',
      {
        presentationStyle: 1,
      }
    );
    expect(webBrowser.openBrowserAsync).not.toHaveBeenCalled();
    expect(result).toEqual({
      method: 'auth-session',
      callback: {
        rawUrl: 'personalagent://voice-control?auth=done',
        hostname: 'voice-control',
        path: 'resume',
        queryParams: {
          auth: 'done',
          state: 'xyz',
        },
        receivedAt: expect.any(Number),
      },
      outcome: 'returned',
    });
  });

  it('opens http urls in the in-app browser', async () => {
    const linking = {
      canOpenURL: jest.fn(async () => true),
      openURL: jest.fn(async () => undefined),
      parse: jest.fn(),
    };
    const webBrowser = {
      openAuthSessionAsync: jest.fn(async () => ({
        type: 'success',
        url: 'personalagent://voice-control?auth=done',
      })),
      openBrowserAsync: jest.fn(async () => ({ type: 'opened' })),
      WebBrowserPresentationStyle: {
        AUTOMATIC: 1,
      },
    };
    const service = new TaskActionLauncherService(linking as never, webBrowser as never);

    const result = await service.open(createAction({ callbackUrl: null }));

    expect(webBrowser.openBrowserAsync).toHaveBeenCalledWith('https://auth.example.com/authorize', {
      presentationStyle: 1,
    });
    expect(linking.openURL).not.toHaveBeenCalled();
    expect(result).toEqual({
      method: 'browser',
      callback: null,
      outcome: 'opened',
    });
  });

  it('reports dismissed auth sessions when no callback is returned', async () => {
    const linking = {
      canOpenURL: jest.fn(async () => true),
      openURL: jest.fn(async () => undefined),
      parse: jest.fn(),
    };
    const webBrowser = {
      openAuthSessionAsync: jest.fn(async () => ({ type: 'cancel' })),
      openBrowserAsync: jest.fn(async () => ({ type: 'opened' })),
      WebBrowserPresentationStyle: {
        AUTOMATIC: 1,
      },
    };
    const service = new TaskActionLauncherService(linking as never, webBrowser as never);

    const result = await service.open(createAction());

    expect(result).toEqual({
      method: 'auth-session',
      callback: null,
      outcome: 'dismissed',
    });
  });

  it('opens custom schemes through expo-linking', async () => {
    const linking = {
      canOpenURL: jest.fn(async () => true),
      openURL: jest.fn(async () => undefined),
      parse: jest.fn(),
    };
    const webBrowser = {
      openAuthSessionAsync: jest.fn(async () => ({
        type: 'success',
        url: 'personalagent://voice-control?auth=done',
      })),
      openBrowserAsync: jest.fn(async () => ({ type: 'opened' })),
      WebBrowserPresentationStyle: {
        AUTOMATIC: 1,
      },
    };
    const service = new TaskActionLauncherService(linking as never, webBrowser as never);

    const result = await service.open(
      createAction({
        url: 'alipay://platformapi/startapp?appId=20000067',
      })
    );

    expect(linking.canOpenURL).toHaveBeenCalledWith('alipay://platformapi/startapp?appId=20000067');
    expect(linking.openURL).toHaveBeenCalledWith('alipay://platformapi/startapp?appId=20000067');
    expect(webBrowser.openBrowserAsync).not.toHaveBeenCalled();
    expect(result).toEqual({
      method: 'linking',
      callback: null,
      outcome: 'opened',
    });
  });

  it('throws when a custom scheme cannot be opened', async () => {
    const service = new TaskActionLauncherService(
      {
        canOpenURL: jest.fn(async () => false),
        openURL: jest.fn(async () => undefined),
        parse: jest.fn(),
      } as never,
      {
        openAuthSessionAsync: jest.fn(async () => ({
          type: 'success',
          url: 'personalagent://voice-control?auth=done',
        })),
        openBrowserAsync: jest.fn(async () => ({ type: 'opened' })),
        WebBrowserPresentationStyle: {
          AUTOMATIC: 1,
        },
      } as never
    );

    await expect(
      service.open(
        createAction({
          url: 'alipay://platformapi/startapp?appId=20000067',
        })
      )
    ).rejects.toThrow('设备当前无法打开链接');
  });
});
