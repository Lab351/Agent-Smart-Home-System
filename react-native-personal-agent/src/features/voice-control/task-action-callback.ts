import type {
  ControlTaskAction,
  ControlTaskState,
  TaskActionCallbackQueryValue,
  TaskActionCallbackResult,
} from '@/types';

type TaskActionCallbackSource = {
  rawUrl: string;
  scheme?: unknown;
  hostname?: unknown;
  path?: unknown;
  queryParams?: Record<string, unknown> | null;
  receivedAt?: number;
};

type ParsedTaskActionCallbackUrl = {
  scheme: string | null;
  hostname: string | null;
  path: string | null;
  queryParams: Record<string, string | string[]>;
};

export function describeTaskActionCallback(callback: TaskActionCallbackResult): string {
  const location = callback.path ?? callback.hostname ?? '应用回跳';
  const queryKeys = Object.keys(callback.queryParams);

  if (!queryKeys.length) {
    return `已收到 ${location} 回跳，可以继续当前任务。`;
  }

  return `已收到 ${location} 回跳，包含参数：${queryKeys.join('、')}。`;
}

export function formatTaskActionCallbackQueryValue(value: TaskActionCallbackQueryValue): string {
  return Array.isArray(value) ? value.join(', ') : value;
}

export function buildTaskActionCallbackResult(
  source: TaskActionCallbackSource
): TaskActionCallbackResult {
  return {
    rawUrl: source.rawUrl,
    hostname: typeof source.hostname === 'string' ? source.hostname : null,
    path: typeof source.path === 'string' ? source.path : null,
    queryParams: normalizeTaskActionCallbackQueryParams(source.queryParams),
    receivedAt: typeof source.receivedAt === 'number' ? source.receivedAt : Date.now(),
  };
}

export function resolveTaskActionCallbackFromUrl(options: {
  url: string;
  expectedCallbackUrl?: string | null;
  receivedAt?: number;
}): TaskActionCallbackResult | null {
  const normalizedUrl = options.url.trim();
  if (!normalizedUrl) {
    return null;
  }

  const callback = buildTaskActionCallbackResult({
    rawUrl: normalizedUrl,
    ...parseTaskActionCallbackUrl(normalizedUrl),
    receivedAt: options.receivedAt,
  });

  if (!matchesExpectedTaskActionCallback(options.expectedCallbackUrl, normalizedUrl)) {
    return null;
  }

  return callback;
}

export function buildTaskContinuationMetadata(options: {
  taskState: ControlTaskState | null | undefined;
  taskAction: ControlTaskAction | null | undefined;
  callback: TaskActionCallbackResult | null;
}): Record<string, unknown> {
  return {
    continuation: {
      requirementKind: resolveRequirementKind(options.taskState, options.taskAction),
      resumedFromState: options.taskState ?? null,
      actionUrl: options.taskAction?.url ?? null,
      callbackUrl: options.taskAction?.callbackUrl ?? null,
      callback: options.callback
        ? {
            rawUrl: options.callback.rawUrl,
            hostname: options.callback.hostname,
            path: options.callback.path,
            queryParams: options.callback.queryParams,
          }
        : null,
    },
  };
}

function resolveRequirementKind(
  taskState: ControlTaskState | null | undefined,
  taskAction: ControlTaskAction | null | undefined
): ControlTaskAction['kind'] {
  if (taskAction?.kind) {
    return taskAction.kind;
  }

  return taskState === 'auth-required' ? 'auth' : 'input';
}

function normalizeTaskActionCallbackQueryParams(
  queryParams: Record<string, unknown> | null | undefined
): Record<string, TaskActionCallbackQueryValue> {
  if (!queryParams) {
    return {};
  }

  const normalized: Record<string, TaskActionCallbackQueryValue> = {};

  for (const [key, value] of Object.entries(queryParams)) {
    const normalizedValue = normalizeTaskActionCallbackQueryValue(value);
    if (normalizedValue) {
      normalized[key] = normalizedValue;
    }
  }

  return normalized;
}

function normalizeTaskActionCallbackQueryValue(value: unknown): TaskActionCallbackQueryValue | null {
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

function matchesExpectedTaskActionCallback(
  expectedCallbackUrl: string | null | undefined,
  actualCallbackUrl: string
): boolean {
  const normalizedExpectedUrl = expectedCallbackUrl?.trim();
  if (!normalizedExpectedUrl) {
    return true;
  }

  const expected = parseTaskActionCallbackUrl(normalizedExpectedUrl);
  const actual = parseTaskActionCallbackUrl(actualCallbackUrl);
  const expectedScheme = normalizeCallbackSegment(expected.scheme);
  const actualScheme = normalizeCallbackSegment(actual.scheme);
  const expectedHostname = normalizeCallbackSegment(expected.hostname);
  const actualHostname = normalizeCallbackSegment(actual.hostname);
  const expectedPath = normalizeCallbackPath(expected.path);
  const actualPath = normalizeCallbackPath(actual.path);

  if (expectedScheme && expectedScheme !== actualScheme) {
    return false;
  }

  if (expectedHostname && expectedHostname !== actualHostname) {
    return false;
  }

  if (expectedPath && expectedPath !== actualPath) {
    return false;
  }

  return true;
}

function normalizeCallbackSegment(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim().toLowerCase() : null;
}

function normalizeCallbackPath(value: string | null | undefined): string | null {
  const normalized = normalizeCallbackSegment(value);
  return normalized ? normalized.replace(/^\/+|\/+$/g, '') || null : null;
}

function parseTaskActionCallbackUrl(url: string): ParsedTaskActionCallbackUrl {
  const parsedUrl = new URL(url);
  const queryParams: Record<string, string | string[]> = {};

  parsedUrl.searchParams.forEach((value, key) => {
    const existingValue = queryParams[key];

    if (Array.isArray(existingValue)) {
      existingValue.push(value);
      return;
    }

    if (existingValue) {
      queryParams[key] = [existingValue, value];
      return;
    }

    queryParams[key] = value;
  });

  return {
    scheme: parsedUrl.protocol.replace(/:$/, ''),
    hostname: parsedUrl.hostname || null,
    path: parsedUrl.pathname.replace(/^\/+|\/+$/g, '') || null,
    queryParams,
  };
}
