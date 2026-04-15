import type { VoiceCommandExecutionResult } from '@/types';

const DEFAULT_HISTORY_LIMIT = 4;

export function prependExecutionHistory(
  history: VoiceCommandExecutionResult[],
  nextResult: VoiceCommandExecutionResult,
  limit: number = DEFAULT_HISTORY_LIMIT
): VoiceCommandExecutionResult[] {
  return normalizeExecutionHistory([nextResult, ...history], limit);
}

export function mergeRecoveredExecutionIntoHistory(
  history: VoiceCommandExecutionResult[],
  recoveredExecution: VoiceCommandExecutionResult,
  limit: number = DEFAULT_HISTORY_LIMIT
): VoiceCommandExecutionResult[] {
  return normalizeExecutionHistory([recoveredExecution, ...history], limit);
}

export function normalizeExecutionHistory(
  history: VoiceCommandExecutionResult[],
  limit: number = DEFAULT_HISTORY_LIMIT
): VoiceCommandExecutionResult[] {
  const normalizedHistory: VoiceCommandExecutionResult[] = [];
  const seenKeys = new Set<string>();

  for (const item of history) {
    if (!isExecutionHistoryItem(item)) {
      continue;
    }

    const key = buildExecutionHistoryKey(item);
    if (seenKeys.has(key)) {
      continue;
    }

    seenKeys.add(key);
    normalizedHistory.push(item);

    if (normalizedHistory.length >= limit) {
      break;
    }
  }

  return normalizedHistory;
}

function isExecutionHistoryItem(value: unknown): value is VoiceCommandExecutionResult {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    typeof (value as VoiceCommandExecutionResult).executedAt === 'number' &&
    typeof (value as VoiceCommandExecutionResult).input === 'string' &&
    typeof (value as VoiceCommandExecutionResult).status === 'string'
  );
}

function buildExecutionHistoryKey(result: VoiceCommandExecutionResult): string {
  return [
    result.executedAt,
    result.taskId ?? '',
    result.taskContextId ?? '',
    result.taskState ?? '',
    result.input,
  ].join('::');
}
