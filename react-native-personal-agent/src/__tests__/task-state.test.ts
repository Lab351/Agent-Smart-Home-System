import type { VoiceCommandExecutionResult } from '@/types';
import {
  buildRoomTaskDispatchPresentation,
  canContinueInterruptedRoomTask,
  finalizeExecutionWithoutTaskTracking,
  formatTaskStateLabel,
  mapTaskStateToStatus,
  shouldTrackRoomTaskResult,
  TASK_TRACKING_UNAVAILABLE_DETAIL,
  TASK_TRACKING_UNAVAILABLE_STATUS,
} from '@/features/voice-control/task-state';

function createExecutionResult(): VoiceCommandExecutionResult {
  return {
    executedAt: 1_700_000_000_000,
    success: true,
    input: '打开客厅主灯',
    status: '命令已提交到 Room-Agent',
    detail: '已向客厅主灯提交控制请求',
    route: 'room-agent',
    roomId: 'livingroom',
    roomName: '客厅',
    agentId: 'room-agent-livingroom',
    taskId: 'task-1',
    taskContextId: 'ctx-1',
    taskState: 'submitted',
    taskTerminal: false,
    taskInterrupted: false,
    intent: {
      text: '打开客厅主灯',
      device: 'main_light',
      action: 'turn_on',
      room: 'livingroom',
      parameters: {},
      confidence: 0.96,
      source: 'llm',
    },
  };
}

describe('task-state helpers', () => {
  it('formats task states for status text and badges', () => {
    expect(mapTaskStateToStatus('working')).toBe('Room-Agent 执行中');
    expect(formatTaskStateLabel('auth-required')).toBe('需要鉴权');
    expect(formatTaskStateLabel(null)).toBeNull();
  });

  it('converts an untracked pending execution into a terminal informational state', () => {
    const result = finalizeExecutionWithoutTaskTracking(createExecutionResult());

    expect(result).toMatchObject({
      success: true,
      status: TASK_TRACKING_UNAVAILABLE_STATUS,
      detail: TASK_TRACKING_UNAVAILABLE_DETAIL,
      taskState: 'unknown',
      taskTerminal: true,
      taskInterrupted: false,
    });
  });

  it('only requests follow-up tracking for running room-agent tasks', () => {
    expect(shouldTrackRoomTaskResult(createExecutionResult())).toBe(true);
    expect(
      shouldTrackRoomTaskResult({
        ...createExecutionResult(),
        taskState: 'completed',
        taskTerminal: true,
      })
    ).toBe(false);
    expect(
      shouldTrackRoomTaskResult({
        ...createExecutionResult(),
        taskState: 'input-required',
        taskInterrupted: true,
      })
    ).toBe(false);
    expect(
      shouldTrackRoomTaskResult({
        ...createExecutionResult(),
        route: 'home-agent',
      })
    ).toBe(false);
  });

  it('builds the action-required presentation for interrupted room-agent tasks', () => {
    expect(
      buildRoomTaskDispatchPresentation(
        {
          success: true,
          state: 'input-required',
          isTerminal: false,
          isInterrupted: true,
          detail: '',
        },
        {
          roomName: '客厅',
          targetDevice: 'main_light',
          action: 'turn_on',
        }
      )
    ).toEqual({
      status: 'Room-Agent 等待补充输入',
      detail: 'Room-Agent 已暂停 客厅 的 main_light turn_on，等待补充输入后继续。',
    });
  });

  it('only allows task continuation when the interrupted task context is complete', () => {
    expect(
      canContinueInterruptedRoomTask({
        ...createExecutionResult(),
        taskState: 'auth-required',
        taskInterrupted: true,
      })
    ).toBe(true);
    expect(
      canContinueInterruptedRoomTask({
        ...createExecutionResult(),
        taskInterrupted: true,
        taskContextId: null,
      })
    ).toBe(false);
  });
});
