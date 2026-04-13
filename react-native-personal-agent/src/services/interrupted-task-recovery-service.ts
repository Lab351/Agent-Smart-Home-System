import { canContinueInterruptedRoomTask } from '@/features/voice-control/task-state';
import { AsyncStorageService } from '@/platform/storage/async-storage-service';
import type { IStorageService, VoiceCommandExecutionResult } from '@/types';

const STORAGE_KEY = 'interrupted-task-recovery';

export interface InterruptedTaskRecoverySnapshot {
  execution: VoiceCommandExecutionResult;
  followUpDraft: string;
  savedAt: number;
}

export class InterruptedTaskRecoveryService {
  constructor(private readonly storage: IStorageService = new AsyncStorageService()) {}

  async load(): Promise<InterruptedTaskRecoverySnapshot | null> {
    let snapshot: InterruptedTaskRecoverySnapshot | null;
    try {
      snapshot = await this.storage.getJson<InterruptedTaskRecoverySnapshot>(STORAGE_KEY);
    } catch (error) {
      console.warn('[InterruptedTaskRecoveryService] Failed to load recovery snapshot', error);
      await this.clear();
      return null;
    }

    if (!snapshot || !canContinueInterruptedRoomTask(snapshot.execution)) {
      await this.clear();
      return null;
    }

    return {
      execution: snapshot.execution,
      followUpDraft: typeof snapshot.followUpDraft === 'string' ? snapshot.followUpDraft : '',
      savedAt: typeof snapshot.savedAt === 'number' ? snapshot.savedAt : Date.now(),
    };
  }

  async save(execution: VoiceCommandExecutionResult, followUpDraft: string): Promise<void> {
    if (!canContinueInterruptedRoomTask(execution)) {
      await this.clear();
      return;
    }

    try {
      await this.storage.setJson(STORAGE_KEY, {
        execution,
        followUpDraft,
        savedAt: Date.now(),
      } satisfies InterruptedTaskRecoverySnapshot);
    } catch (error) {
      console.warn('[InterruptedTaskRecoveryService] Failed to persist recovery snapshot', error);
    }
  }

  async clear(): Promise<void> {
    try {
      await this.storage.remove(STORAGE_KEY);
    } catch (error) {
      console.warn('[InterruptedTaskRecoveryService] Failed to clear recovery snapshot', error);
    }
  }
}
