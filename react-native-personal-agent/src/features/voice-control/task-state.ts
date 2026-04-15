import type {
  ControlDispatchResult,
  ControlTaskState,
  ControlTaskStateUpdate,
  VoiceCommandExecutionResult,
} from '@/types';

export const TASK_TRACKING_UNAVAILABLE_STATUS = '命令已提交（状态跟踪不可用）';
export const TASK_TRACKING_UNAVAILABLE_DETAIL =
  '命令已提交，但当前无法继续跟踪 Room-Agent 的最终执行状态。';

export function mapTaskStateToStatus(state: ControlTaskState | null | undefined): string {
  switch (state) {
    case 'submitted':
      return 'Room-Agent 已接收任务';
    case 'working':
      return 'Room-Agent 执行中';
    case 'completed':
      return 'Room-Agent 已完成执行';
    case 'failed':
      return 'Room-Agent 执行失败';
    case 'canceled':
      return 'Room-Agent 已取消任务';
    case 'rejected':
      return 'Room-Agent 拒绝执行';
    case 'input-required':
      return 'Room-Agent 需要补充输入';
    case 'auth-required':
      return 'Room-Agent 需要鉴权';
    default:
      return 'Room-Agent 状态未知';
  }
}

export function formatTaskStateLabel(state: ControlTaskState | null | undefined): string | null {
  switch (state) {
    case 'submitted':
      return '任务已提交';
    case 'working':
      return '任务执行中';
    case 'completed':
      return '任务已完成';
    case 'failed':
      return '任务失败';
    case 'canceled':
      return '任务取消';
    case 'rejected':
      return '任务被拒绝';
    case 'input-required':
      return '需要补充输入';
    case 'auth-required':
      return '需要鉴权';
    case 'unknown':
      return '状态未知';
    default:
      return null;
  }
}

export function mergeExecutionState(
  current: VoiceCommandExecutionResult,
  update: ControlTaskStateUpdate
): VoiceCommandExecutionResult {
  return {
    ...current,
    success: update.success,
    status: mapTaskStateToStatus(update.state),
    detail: update.detail,
    taskId: update.taskId,
    taskContextId: update.contextId,
    taskState: update.state,
    taskTerminal: update.isTerminal,
    taskInterrupted: update.isInterrupted,
    taskAction: update.action,
  };
}

export function buildRoomTaskDispatchPresentation(
  dispatch: Pick<
    ControlDispatchResult,
    'detail' | 'isInterrupted' | 'isTerminal' | 'state' | 'success'
  >,
  context?: {
    roomName?: string | null;
    targetDevice?: string | null;
    action?: string | null;
  }
): {
  status: string;
  detail: string;
} {
  const status = resolveRoomTaskDispatchStatus(dispatch);
  const detail = dispatch.detail || resolveRoomTaskDispatchDetail(dispatch, context);

  return {
    status,
    detail,
  };
}

export function shouldTrackRoomTaskResult(
  result: VoiceCommandExecutionResult
): result is VoiceCommandExecutionResult & {
  route: 'room-agent';
  success: true;
  roomId: string;
  taskId: string;
  taskTerminal: false;
  taskInterrupted?: false;
} {
  return (
    result.route === 'room-agent' &&
    result.success &&
    Boolean(result.roomId) &&
    Boolean(result.taskId) &&
    result.taskTerminal === false &&
    result.taskInterrupted !== true
  );
}

export function canContinueInterruptedRoomTask(
  result: VoiceCommandExecutionResult | null
): result is VoiceCommandExecutionResult & {
  route: 'room-agent';
  roomId: string;
  taskId: string;
  taskContextId: string;
  taskInterrupted: true;
} {
  return (
    result?.route === 'room-agent' &&
    result.taskInterrupted === true &&
    Boolean(result.roomId) &&
    Boolean(result.taskId) &&
    Boolean(result.taskContextId)
  );
}

export function finalizeExecutionWithoutTaskTracking(
  current: VoiceCommandExecutionResult
): VoiceCommandExecutionResult {
  return {
    ...current,
    status: TASK_TRACKING_UNAVAILABLE_STATUS,
    detail: TASK_TRACKING_UNAVAILABLE_DETAIL,
    taskState: 'unknown',
    taskTerminal: true,
    taskInterrupted: false,
    taskAction: null,
  };
}

function resolveRoomTaskDispatchStatus(
  dispatch: Pick<ControlDispatchResult, 'isInterrupted' | 'isTerminal' | 'state' | 'success'>
): string {
  if (dispatch.isInterrupted) {
    switch (dispatch.state) {
      case 'auth-required':
        return 'Room-Agent 等待鉴权';
      case 'input-required':
        return 'Room-Agent 等待补充输入';
      default:
        return 'Room-Agent 已暂停等待处理';
    }
  }

  if (!dispatch.success) {
    switch (dispatch.state) {
      case 'failed':
        return 'Room-Agent 执行失败';
      case 'canceled':
        return 'Room-Agent 已取消任务';
      case 'rejected':
        return 'Room-Agent 拒绝执行';
      case 'auth-required':
        return 'Room-Agent 需要鉴权';
      case 'input-required':
        return 'Room-Agent 需要补充输入';
      default:
        return 'Room-Agent 调用失败';
    }
  }

  if (!dispatch.isTerminal) {
    return dispatch.state === 'working' ? 'Room-Agent 执行中' : '命令已提交到 Room-Agent';
  }

  return 'Room-Agent 已完成执行';
}

function resolveRoomTaskDispatchDetail(
  dispatch: Pick<ControlDispatchResult, 'isInterrupted' | 'isTerminal' | 'state'>,
  context?: {
    roomName?: string | null;
    targetDevice?: string | null;
    action?: string | null;
  }
): string {
  const taskTarget =
    context?.roomName && context?.targetDevice && context?.action
      ? `${context.roomName} 的 ${context.targetDevice} ${context.action}`
      : '当前任务';

  if (dispatch.isInterrupted) {
    return dispatch.state === 'auth-required'
      ? `Room-Agent 已暂停 ${taskTarget}，等待完成鉴权后继续。`
      : `Room-Agent 已暂停 ${taskTarget}，等待补充输入后继续。`;
  }

  if (!dispatch.isTerminal) {
    return `已向 ${taskTarget} 提交控制请求，正在等待 Room-Agent 返回最终结果。`;
  }

  if (dispatch.state === 'completed') {
    return `Room-Agent 已完成 ${taskTarget}。`;
  }

  return '命令发送失败，请检查 room-agent A2A 服务和 discovery 数据。';
}
