import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import type { ControlTaskAction, TaskActionCallbackResult } from '@/types';

type LinkingModule = {
  canOpenURL: (url: string) => Promise<boolean>;
  openURL: (url: string) => Promise<unknown>;
  parse: typeof Linking.parse;
};

type WebBrowserModule = {
  openAuthSessionAsync: typeof WebBrowser.openAuthSessionAsync;
  openBrowserAsync: typeof WebBrowser.openBrowserAsync;
  WebBrowserPresentationStyle: typeof WebBrowser.WebBrowserPresentationStyle;
};

export type TaskActionLaunchResult = {
  method: 'auth-session' | 'browser' | 'linking';
  callback: TaskActionCallbackResult | null;
  outcome: 'opened' | 'returned' | 'dismissed';
};

export class TaskActionLauncherService {
  constructor(
    private readonly linking: LinkingModule = Linking,
    private readonly webBrowser: WebBrowserModule = WebBrowser
  ) {}

  async open(action: ControlTaskAction): Promise<TaskActionLaunchResult> {
    const url = action.url?.trim();
    if (!url) {
      throw new Error('当前任务没有可打开的外部链接。');
    }

    if (this.isHttpUrl(url)) {
      if (action.kind === 'auth' && this.canUseAuthSession(action.callbackUrl)) {
        return this.openInAuthSession(url, action.callbackUrl!.trim());
      }

      return this.openInBrowser(url);
    }

    const canOpen = await this.linking.canOpenURL(url);
    if (!canOpen) {
      throw new Error(`设备当前无法打开链接：${url}`);
    }

    await this.linking.openURL(url);
    return {
      method: 'linking',
      callback: null,
      outcome: 'opened',
    };
  }

  private async openInAuthSession(
    url: string,
    callbackUrl: string
  ): Promise<TaskActionLaunchResult> {
    const result = await this.webBrowser.openAuthSessionAsync(url, callbackUrl, {
      presentationStyle: this.webBrowser.WebBrowserPresentationStyle?.AUTOMATIC,
    });

    return {
      method: 'auth-session',
      callback:
        result.type === 'success' && 'url' in result ? this.parseCallbackResult(result.url) : null,
      outcome: result.type === 'success' ? 'returned' : 'dismissed',
    };
  }

  private async openInBrowser(url: string): Promise<TaskActionLaunchResult> {
    const result = await this.webBrowser.openBrowserAsync(url, {
      presentationStyle: this.webBrowser.WebBrowserPresentationStyle?.AUTOMATIC,
    });

    return {
      method: 'browser',
      callback: null,
      outcome: result.type === 'opened' ? 'opened' : 'dismissed',
    };
  }

  private isHttpUrl(url: string): boolean {
    return /^https?:\/\//i.test(url);
  }

  private canUseAuthSession(callbackUrl: string | null): boolean {
    const normalized = callbackUrl?.trim();
    return Boolean(normalized && !this.isHttpUrl(normalized) && this.isDeepLinkUrl(normalized));
  }

  private isDeepLinkUrl(url: string): boolean {
    return /^[a-z][a-z0-9+.-]*:\/\//i.test(url);
  }

  private parseCallbackResult(url: string): TaskActionCallbackResult {
    const parsed = this.linking.parse(url);

    return {
      rawUrl: url,
      hostname: typeof parsed.hostname === 'string' ? parsed.hostname : null,
      path: typeof parsed.path === 'string' ? parsed.path : null,
      queryParams: this.normalizeQueryParams(parsed.queryParams),
      receivedAt: Date.now(),
    };
  }

  private normalizeQueryParams(queryParams: Record<string, unknown> | null | undefined) {
    if (!queryParams) {
      return {};
    }

    const normalized: TaskActionCallbackResult['queryParams'] = {};

    for (const [key, value] of Object.entries(queryParams)) {
      const normalizedValue = this.normalizeQueryParamValue(value);
      if (normalizedValue) {
        normalized[key] = normalizedValue;
      }
    }

    return normalized;
  }

  private normalizeQueryParamValue(value: unknown): string | string[] | null {
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }

    if (Array.isArray(value)) {
      const normalizedValues = value
        .map(item => (typeof item === 'string' && item.length > 0 ? item : null))
        .filter((item): item is string => Boolean(item));

      return normalizedValues.length ? normalizedValues : null;
    }

    return null;
  }
}
