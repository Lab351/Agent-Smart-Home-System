import { normalizeExecutionHistory } from '@/features/voice-control/execution-history';
import { AsyncStorageService } from '@/platform/storage/async-storage-service';
import type { IStorageService, VoiceCommandExecutionResult } from '@/types';

const STORAGE_KEY = 'execution-history';

export class ExecutionHistoryService {
  constructor(private readonly storage: IStorageService = new AsyncStorageService()) {}

  async load(): Promise<VoiceCommandExecutionResult[]> {
    let history: unknown;
    try {
      history = await this.storage.getJson<unknown>(STORAGE_KEY);
    } catch (error) {
      console.warn('[ExecutionHistoryService] Failed to load persisted history', error);
      await this.clear();
      return [];
    }

    if (!Array.isArray(history)) {
      await this.clear();
      return [];
    }

    const normalizedHistory = normalizeExecutionHistory(history as VoiceCommandExecutionResult[]);

    if (normalizedHistory.length !== history.length) {
      await this.save(normalizedHistory);
    }

    return normalizedHistory;
  }

  async save(history: VoiceCommandExecutionResult[]): Promise<void> {
    const normalizedHistory = normalizeExecutionHistory(history);

    try {
      if (!normalizedHistory.length) {
        await this.clear();
        return;
      }

      await this.storage.setJson(STORAGE_KEY, normalizedHistory);
    } catch (error) {
      console.warn('[ExecutionHistoryService] Failed to persist history', error);
    }
  }

  async clear(): Promise<void> {
    try {
      await this.storage.remove(STORAGE_KEY);
    } catch (error) {
      console.warn('[ExecutionHistoryService] Failed to clear persisted history', error);
    }
  }
}
