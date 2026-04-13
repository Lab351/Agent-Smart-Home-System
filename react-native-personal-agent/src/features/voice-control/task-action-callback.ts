import type {
  ControlTaskAction,
  ControlTaskState,
  TaskActionCallbackQueryValue,
  TaskActionCallbackResult,
} from '@/types';

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
