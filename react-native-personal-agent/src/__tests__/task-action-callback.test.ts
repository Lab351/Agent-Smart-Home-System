import {
  buildTaskActionCallbackResult,
  buildTaskContinuationMetadata,
  describeTaskActionCallback,
  formatTaskActionCallbackQueryValue,
  resolveTaskActionCallbackFromUrl,
} from '@/features/voice-control/task-action-callback';

describe('task-action-callback helpers', () => {
  it('describes callback locations and query keys for UI summaries', () => {
    const summary = describeTaskActionCallback({
      rawUrl: 'personalagent://voice-control/resume?code=abc&state=xyz',
      hostname: 'voice-control',
      path: 'resume',
      queryParams: {
        code: 'abc',
        state: 'xyz',
      },
      receivedAt: 1,
    });

    expect(summary).toBe('已收到 resume 回跳，包含参数：code、state。');
  });

  it('builds continuation metadata with parsed callback details', () => {
    expect(
      buildTaskContinuationMetadata({
        taskState: 'auth-required',
        taskAction: {
          kind: 'auth',
          label: '打开鉴权页',
          description: '请完成鉴权',
          url: 'https://auth.example.com/authorize',
          callbackUrl: 'personalagent://voice-control/resume',
        },
        callback: {
          rawUrl: 'personalagent://voice-control/resume?code=abc&state=xyz',
          hostname: 'voice-control',
          path: 'resume',
          queryParams: {
            code: 'abc',
            state: 'xyz',
          },
          receivedAt: 1,
        },
      })
    ).toEqual({
      continuation: {
        requirementKind: 'auth',
        resumedFromState: 'auth-required',
        actionUrl: 'https://auth.example.com/authorize',
        callbackUrl: 'personalagent://voice-control/resume',
        callback: {
          rawUrl: 'personalagent://voice-control/resume?code=abc&state=xyz',
          hostname: 'voice-control',
          path: 'resume',
          queryParams: {
            code: 'abc',
            state: 'xyz',
          },
        },
      },
    });
  });

  it('formats multi-value query params for display', () => {
    expect(formatTaskActionCallbackQueryValue(['scope:a', 'scope:b'])).toBe('scope:a, scope:b');
  });

  it('normalizes callback payloads into a reusable result shape', () => {
    expect(
      buildTaskActionCallbackResult({
        rawUrl: 'personalagent://voice-control/resume?code=abc',
        hostname: 'voice-control',
        path: 'resume',
        queryParams: {
          code: 'abc',
          empty: '',
          scope: ['read', '', 'write'],
        },
        receivedAt: 123,
      })
    ).toEqual({
      rawUrl: 'personalagent://voice-control/resume?code=abc',
      hostname: 'voice-control',
      path: 'resume',
      queryParams: {
        code: 'abc',
        scope: ['read', 'write'],
      },
      receivedAt: 123,
    });
  });

  it('accepts cold-start callback urls that match the expected scheme and host', () => {
    expect(
      resolveTaskActionCallbackFromUrl({
        url: 'personalagent://voice-control/resume?code=abc&state=xyz',
        expectedCallbackUrl: 'personalagent://voice-control',
        receivedAt: 456,
      })
    ).toEqual({
      rawUrl: 'personalagent://voice-control/resume?code=abc&state=xyz',
      hostname: 'voice-control',
      path: 'resume',
      queryParams: {
        code: 'abc',
        state: 'xyz',
      },
      receivedAt: 456,
    });
  });

  it('ignores urls that do not match the expected callback target', () => {
    expect(
      resolveTaskActionCallbackFromUrl({
        url: 'otherapp://voice-control/resume?code=abc',
        expectedCallbackUrl: 'personalagent://voice-control/resume',
      })
    ).toBeNull();
  });
});
