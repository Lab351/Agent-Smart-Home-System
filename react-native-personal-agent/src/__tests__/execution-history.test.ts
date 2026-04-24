import type { VoiceCommandExecutionResult } from '@/types';
import {
  mergeRecoveredExecutionIntoHistory,
  normalizeExecutionHistory,
  prependExecutionHistory,
} from '@/features/voice-control/execution-history';

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

describe('prependExecutionHistory', () => {
  it('prepends the latest execution and trims to the configured limit', () => {
    const history = [createResult(1), createResult(2), createResult(3), createResult(4)];

    const nextHistory = prependExecutionHistory(history, createResult(5));

    expect(nextHistory).toHaveLength(4);
    expect(nextHistory.map(item => item.input)).toEqual([
      'command-5',
      'command-1',
      'command-2',
      'command-3',
    ]);
  });

  it('deduplicates duplicated persisted items when normalizing history', () => {
    const duplicated = createResult(1);

    expect(
      normalizeExecutionHistory([
        duplicated,
        duplicated,
        { foo: 'bar' } as never,
        createResult(2),
      ])
    ).toEqual([duplicated, createResult(2)]);
  });

  it('merges a recovered execution without duplicating the latest item', () => {
    const recovered = createResult(1);

    expect(mergeRecoveredExecutionIntoHistory([recovered, createResult(2)], recovered)).toEqual([
      recovered,
      createResult(2),
    ]);
  });
});
