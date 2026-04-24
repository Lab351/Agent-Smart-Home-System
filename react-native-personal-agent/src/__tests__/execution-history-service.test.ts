import { ExecutionHistoryService } from '@/services/execution-history-service';
import type { IStorageService, VoiceCommandExecutionResult } from '@/types';

function createResult(id: number): VoiceCommandExecutionResult {
  return {
    executedAt: 1_700_000_000_000 + id,
    success: id % 2 === 0,
    input: `command-${id}`,
    status: `status-${id}`,
    detail: `detail-${id}`,
    route: 'room-agent',
    roomId: 'livingroom',
    roomName: '客厅',
    agentId: `room-agent-${id}`,
    taskId: `task-${id}`,
    taskContextId: `ctx-${id}`,
    taskState: 'completed',
    taskTerminal: true,
    taskInterrupted: false,
    intent: {
      text: `command-${id}`,
      kind: 'action',
      device: 'main_light',
      action: 'turn_on',
      room: 'livingroom',
      parameters: {},
      confidence: 0.9,
      source: 'llm',
      reply: null,
      query: null,
    },
  };
}

function createStorage(initialValue: unknown = null): IStorageService {
  let value = initialValue;

  return {
    getString: jest.fn(async () => (typeof value === 'string' ? value : null)),
    getJson: jest.fn(async () => value as never),
    setString: jest.fn(async (_key: string, nextValue: string) => {
      value = nextValue;
    }),
    setJson: jest.fn(async (_key: string, nextValue: unknown) => {
      value = nextValue;
    }),
    remove: jest.fn(async () => {
      value = null;
    }),
  };
}

describe('ExecutionHistoryService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('normalizes history when loading persisted entries', async () => {
    const duplicated = createResult(1);
    const invalid = { foo: 'bar' };
    const storage = createStorage([duplicated, duplicated, invalid, createResult(2), createResult(3)]);
    const service = new ExecutionHistoryService(storage);

    await expect(service.load()).resolves.toEqual([
      duplicated,
      createResult(2),
      createResult(3),
    ]);
    expect(storage.setJson).toHaveBeenCalledWith('execution-history', [
      duplicated,
      createResult(2),
      createResult(3),
    ]);
  });

  it('clears malformed persisted history payloads', async () => {
    const storage = createStorage({ foo: 'bar' });
    const service = new ExecutionHistoryService(storage);

    await expect(service.load()).resolves.toEqual([]);
    expect(storage.remove).toHaveBeenCalledWith('execution-history');
  });

  it('trims and saves the latest four history entries', async () => {
    const storage = createStorage();
    const service = new ExecutionHistoryService(storage);
    const history = [createResult(1), createResult(2), createResult(3), createResult(4), createResult(5)];

    await service.save(history);

    expect(storage.setJson).toHaveBeenCalledWith('execution-history', [
      createResult(1),
      createResult(2),
      createResult(3),
      createResult(4),
    ]);
  });

  it('falls back to an empty history when storage read fails', async () => {
    const storage = createStorage();
    storage.getJson = jest.fn(async () => {
      throw new Error('corrupted json');
    });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const service = new ExecutionHistoryService(storage);

    await expect(service.load()).resolves.toEqual([]);

    expect(storage.remove).toHaveBeenCalledWith('execution-history');
    expect(warnSpy).toHaveBeenCalledWith(
      '[ExecutionHistoryService] Failed to load persisted history',
      expect.any(Error)
    );
  });

  it('swallows storage write failures when persisting history', async () => {
    const storage = createStorage();
    storage.setJson = jest.fn(async () => {
      throw new Error('disk full');
    });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const service = new ExecutionHistoryService(storage);

    await expect(service.save([createResult(1)])).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledWith(
      '[ExecutionHistoryService] Failed to persist history',
      expect.any(Error)
    );
  });
});
