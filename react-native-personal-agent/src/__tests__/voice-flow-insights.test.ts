import type { VoiceCommandExecutionResult } from '@/types';
import { buildVoiceFlowInsights } from '@/features/voice-control/voice-flow-insights';

function createExecutionResult(
  overrides: Partial<VoiceCommandExecutionResult> = {}
): VoiceCommandExecutionResult {
  return {
    executedAt: 1_700_000_000_000,
    success: true,
    input: '打开客厅主灯',
    status: 'Room-Agent 已完成执行',
    detail: '客厅主灯已打开',
    route: 'room-agent',
    roomId: 'livingroom',
    roomName: '客厅',
    agentId: 'room-agent-livingroom',
    taskId: 'task-1',
    taskState: 'completed',
    taskTerminal: true,
    taskInterrupted: false,
    intent: {
      text: '打开客厅主灯',
      kind: 'agent_message',
      device: 'main_light',
      action: 'turn_on',
      room: 'livingroom',
      parameters: {},
      confidence: 0.96,
      source: 'llm',
      reply: null,
      query: null,
    },
    ...overrides,
  };
}

describe('buildVoiceFlowInsights', () => {
  it('marks the ASR stage as active while recognition is running', () => {
    const insights = buildVoiceFlowInsights({
      isRecording: false,
      isRecognizingSpeech: true,
      isExecutingCommand: false,
      isAwaitingCommandResult: false,
      lastCommandExecution: null,
    });

    expect(insights.title).toBe('正在做 ASR 与语义理解');
    expect(insights.steps.map(step => step.state)).toEqual([
      'complete',
      'active',
      'idle',
      'idle',
    ]);
  });

  it('marks feedback as active for a non-terminal room-agent task', () => {
    const insights = buildVoiceFlowInsights({
      isRecording: false,
      isRecognizingSpeech: false,
      isExecutingCommand: false,
      isAwaitingCommandResult: true,
      lastCommandExecution: createExecutionResult({
        success: true,
        status: '命令已提交到 Room-Agent',
        detail: '已向客厅主灯提交控制请求',
        taskState: 'submitted',
        taskTerminal: false,
      }),
    });

    expect(insights.title).toBe('正在等待 Room-Agent 最终结果');
    expect(insights.steps.map(step => step.state)).toEqual([
      'complete',
      'complete',
      'complete',
      'active',
    ]);
  });

  it('marks the understanding stage as failed when routing stays unresolved', () => {
    const insights = buildVoiceFlowInsights({
      isRecording: false,
      isRecognizingSpeech: false,
      isExecutingCommand: false,
      isAwaitingCommandResult: false,
      lastCommandExecution: createExecutionResult({
        success: false,
        route: 'unresolved',
        status: '缺少设备目标',
        detail: '动作已识别，但目标设备不明确。',
        taskId: null,
        taskState: null,
        taskTerminal: undefined,
      }),
    });

    expect(insights.title).toBe('本次请求在理解与路由阶段中断');
    expect(insights.steps.map(step => step.state)).toEqual([
      'complete',
      'error',
      'idle',
      'idle',
    ]);
  });

  it('marks every stage complete after a terminal success result', () => {
    const insights = buildVoiceFlowInsights({
      isRecording: false,
      isRecognizingSpeech: false,
      isExecutingCommand: false,
      isAwaitingCommandResult: false,
      lastCommandExecution: createExecutionResult(),
    });

    expect(insights.title).toBe('本次 Agent 转发已完成');
    expect(insights.steps.every(step => step.state === 'complete')).toBe(true);
  });

  it('marks feedback as paused when the room-agent requests extra input', () => {
    const insights = buildVoiceFlowInsights({
      isRecording: false,
      isRecognizingSpeech: false,
      isExecutingCommand: false,
      isAwaitingCommandResult: false,
      lastCommandExecution: createExecutionResult({
        success: true,
        status: 'Room-Agent 等待补充输入',
        detail: '请补充需要控制的亮度值。',
        taskState: 'input-required',
        taskTerminal: false,
        taskInterrupted: true,
      }),
    });

    expect(insights.title).toBe('等待补充输入后继续');
    expect(insights.steps.map(step => step.state)).toEqual([
      'complete',
      'complete',
      'complete',
      'paused',
    ]);
  });
});
