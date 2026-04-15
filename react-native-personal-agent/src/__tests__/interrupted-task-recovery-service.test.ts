import { InterruptedTaskRecoveryService } from '@/services/interrupted-task-recovery-service';
import type {
  IStorageService,
  ParsedIntent,
  VoiceCommandExecutionResult,
} from '@/types';

class MemoryStorageService implements IStorageService {
  private readonly storage = new Map<string, string>();

  async getString(key: string): Promise<string | null> {
    return this.storage.get(key) ?? null;
  }

  async getJson<T>(key: string): Promise<T | null> {
    const value = await this.getString(key);
    return value ? (JSON.parse(value) as T) : null;
  }

  async setString(key: string, value: string): Promise<void> {
    this.storage.set(key, value);
  }

  async setJson(key: string, value: unknown): Promise<void> {
    this.storage.set(key, JSON.stringify(value));
  }

  async remove(key: string): Promise<void> {
    this.storage.delete(key);
  }
}

function createIntent(overrides: Partial<ParsedIntent> = {}): ParsedIntent {
  return {
    text: '把客厅主灯亮度调到 80',
    device: 'main_light',
    action: 'set_brightness',
    room: 'livingroom',
    parameters: {
      brightness: 80,
    },
    confidence: 0.93,
    source: 'llm',
    ...overrides,
  };
}

function createExecution(
  overrides: Partial<VoiceCommandExecutionResult> = {}
): VoiceCommandExecutionResult {
  return {
    executedAt: 1775430000000,
    success: true,
    input: '把客厅主灯亮度调到 80',
    status: '等待补充任务参数',
    detail: 'Room-Agent 需要更多输入。',
    route: 'room-agent',
    intent: createIntent(),
    roomId: 'livingroom',
    roomName: '客厅',
    agentId: 'room-agent-livingroom',
    taskId: 'task-1',
    taskContextId: 'ctx-1',
    taskState: 'input-required',
    taskTerminal: false,
    taskInterrupted: true,
    ...overrides,
  };
}

describe('InterruptedTaskRecoveryService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('persists and restores interrupted task snapshots', async () => {
    const service = new InterruptedTaskRecoveryService(new MemoryStorageService());
    const execution = createExecution();

    await service.save(execution, '亮度 80%，色温偏暖。');

    const restored = await service.load();

    expect(restored).toMatchObject({
      execution: expect.objectContaining({
        taskId: 'task-1',
        taskContextId: 'ctx-1',
        taskInterrupted: true,
      }),
      followUpDraft: '亮度 80%，色温偏暖。',
    });
  });

  it('clears storage when the execution is no longer resumable', async () => {
    const service = new InterruptedTaskRecoveryService(new MemoryStorageService());

    await service.save(
      createExecution({
        taskInterrupted: false,
        taskState: 'completed',
        taskTerminal: true,
      }),
      ''
    );

    await expect(service.load()).resolves.toBeNull();
  });

  it('drops invalid persisted snapshots on load', async () => {
    const storage = new MemoryStorageService();
    const service = new InterruptedTaskRecoveryService(storage);

    await storage.setJson('interrupted-task-recovery', {
      execution: createExecution({
        taskContextId: null,
      }),
      followUpDraft: '继续',
      savedAt: 1775430000000,
    });

    await expect(service.load()).resolves.toBeNull();
    await expect(storage.getJson('interrupted-task-recovery')).resolves.toBeNull();
  });

  it('falls back to null when reading the recovery snapshot fails', async () => {
    const storage = new MemoryStorageService();
    storage.getJson = jest.fn(async () => {
      throw new Error('corrupted json');
    });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const service = new InterruptedTaskRecoveryService(storage);

    await expect(service.load()).resolves.toBeNull();

    expect(storage.getJson).toHaveBeenCalledWith('interrupted-task-recovery');
    expect(warnSpy).toHaveBeenCalledWith(
      '[InterruptedTaskRecoveryService] Failed to load recovery snapshot',
      expect.any(Error)
    );
  });

  it('swallows storage write failures when persisting a recovery snapshot', async () => {
    const storage = new MemoryStorageService();
    storage.setJson = jest.fn(async () => {
      throw new Error('disk full');
    });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const service = new InterruptedTaskRecoveryService(storage);

    await expect(service.save(createExecution(), '继续执行')).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledWith(
      '[InterruptedTaskRecoveryService] Failed to persist recovery snapshot',
      expect.any(Error)
    );
  });
});
