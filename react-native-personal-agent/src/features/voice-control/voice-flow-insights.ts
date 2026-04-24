import type { VoiceCommandExecutionResult } from '@/types';

type VoiceFlowStepKey = 'capture' | 'understand' | 'dispatch' | 'feedback';

export type VoiceFlowStepState = 'idle' | 'active' | 'complete' | 'paused' | 'error';

export type VoiceFlowStep = {
  key: VoiceFlowStepKey;
  label: string;
  note: string;
  state: VoiceFlowStepState;
};

export type VoiceFlowInsights = {
  title: string;
  detail: string;
  steps: VoiceFlowStep[];
};

type VoiceFlowSnapshot = {
  isRecording: boolean;
  isRecognizingSpeech: boolean;
  isExecutingCommand: boolean;
  isAwaitingCommandResult: boolean;
  lastCommandExecution: VoiceCommandExecutionResult | null;
};

const STEP_ORDER: VoiceFlowStepKey[] = ['capture', 'understand', 'dispatch', 'feedback'];

export function buildVoiceFlowInsights(snapshot: VoiceFlowSnapshot): VoiceFlowInsights {
  const activeStep = resolveActiveStep(snapshot);
  const failedStep = resolveFailedStep(snapshot.lastCommandExecution);
  const interruptedStep = resolveInterruptedStep(snapshot.lastCommandExecution);

  return {
    title: resolveSummaryTitle(snapshot, failedStep, interruptedStep),
    detail: resolveSummaryDetail(snapshot),
    steps: STEP_ORDER.map((key, index) => ({
      key,
      label: resolveStepLabel(key),
      note: resolveStepNote(key, snapshot),
      state: resolveStepState({
        key,
        index,
        activeStep,
        failedStep,
        interruptedStep,
        hasTerminalResult: Boolean(snapshot.lastCommandExecution && !activeStep && !failedStep),
      }),
    })),
  };
}

function resolveActiveStep(snapshot: VoiceFlowSnapshot): VoiceFlowStepKey | null {
  if (snapshot.isRecording) {
    return 'capture';
  }

  if (snapshot.isRecognizingSpeech) {
    return 'understand';
  }

  if (snapshot.isExecutingCommand) {
    return 'dispatch';
  }

  if (snapshot.isAwaitingCommandResult || isPendingExecution(snapshot.lastCommandExecution)) {
    return 'feedback';
  }

  return null;
}

function resolveFailedStep(
  result: VoiceCommandExecutionResult | null
): VoiceFlowStepKey | null {
  if (!result || result.success || result.taskInterrupted) {
    return null;
  }

  if (result.route === 'unresolved') {
    return 'understand';
  }

  if (result.route === 'chat') {
    return 'understand';
  }

  if (result.route === 'room-agent' && result.taskState) {
    return 'feedback';
  }

  return 'dispatch';
}

function resolveInterruptedStep(
  result: VoiceCommandExecutionResult | null
): VoiceFlowStepKey | null {
  if (!result?.taskInterrupted) {
    return null;
  }

  return 'feedback';
}

function resolveSummaryTitle(
  snapshot: VoiceFlowSnapshot,
  failedStep: VoiceFlowStepKey | null,
  interruptedStep: VoiceFlowStepKey | null
): string {
  if (snapshot.isRecording) {
    return '正在采集语音输入';
  }

  if (snapshot.isRecognizingSpeech) {
    return '正在做 ASR 与语义理解';
  }

  if (snapshot.isExecutingCommand) {
    return '正在做 discovery 和控制下发';
  }

  if (snapshot.isAwaitingCommandResult || isPendingExecution(snapshot.lastCommandExecution)) {
    return '正在等待 Room-Agent 最终结果';
  }

  if (interruptedStep === 'feedback') {
    return snapshot.lastCommandExecution?.taskState === 'auth-required'
      ? '等待完成鉴权后继续'
      : '等待补充输入后继续';
  }

  if (failedStep === 'understand') {
    return '本次命令在理解阶段中断';
  }

  if (failedStep === 'dispatch') {
    return snapshot.lastCommandExecution?.route === 'query'
      ? '本次查询在执行阶段中断'
      : '本次命令在下发阶段中断';
  }

  if (failedStep === 'feedback') {
    return '本次命令在结果回流阶段失败';
  }

  if (snapshot.lastCommandExecution) {
    return snapshot.lastCommandExecution.route === 'chat'
      ? '本次对话回复已完成'
      : snapshot.lastCommandExecution.route === 'query'
        ? '本次设备查询已完成'
        : '本次控制链路已完成';
  }

  return '等待新的语音或文本指令';
}

function resolveSummaryDetail(snapshot: VoiceFlowSnapshot): string {
  if (snapshot.isRecording) {
    return '麦克风正在采集音频；停止录音后会自动进入 ASR 和后续控制链路。';
  }

  if (snapshot.isRecognizingSpeech) {
    return '录音文件已经生成，当前正在等待后端返回稳定文本，并继续进入意图解析。';
  }

  if (snapshot.isExecutingCommand) {
    return '系统正在做意图解析，并根据结果进入查询或控制链路。';
  }

  if (snapshot.isAwaitingCommandResult || isPendingExecution(snapshot.lastCommandExecution)) {
    return (
      snapshot.lastCommandExecution?.detail ??
      '控制请求已经提交，当前正在等待 Room-Agent 返回最终任务状态。'
    );
  }

  if (snapshot.lastCommandExecution?.taskInterrupted) {
    return snapshot.lastCommandExecution.detail;
  }

  if (snapshot.lastCommandExecution) {
    return snapshot.lastCommandExecution.detail;
  }

  return '可以直接录音，也可以用文本调试链路来验证 ASR 之外的控制路径。';
}

function resolveStepLabel(key: VoiceFlowStepKey): string {
  switch (key) {
    case 'capture':
      return '1. 输入';
    case 'understand':
      return '2. 理解';
    case 'dispatch':
      return '3. 下发';
    case 'feedback':
      return '4. 回流';
  }
}

function resolveStepNote(key: VoiceFlowStepKey, snapshot: VoiceFlowSnapshot): string {
  const result = snapshot.lastCommandExecution;

  switch (key) {
    case 'capture':
      return snapshot.isRecording
        ? '麦克风正在采集音频'
        : result
          ? '本次输入已经送入链路'
          : '支持录音和文本调试';
    case 'understand':
      if (snapshot.isRecognizingSpeech) {
        return '后端 ASR 正在返回文本';
      }

      return result?.route === 'unresolved'
        ? '意图或房间解析停在这里'
        : result?.route === 'chat'
          ? '这一步直接生成对话回复'
        : 'ASR 与 Intent 共同负责理解';
    case 'dispatch':
      if (snapshot.isExecutingCommand) {
        return result?.route === 'query'
          ? '正在做 discovery、探活和设备清单查询'
          : '正在做 discovery、探活和命令下发';
      }

      return result?.route && result.route !== 'unresolved' && result.route !== 'chat'
        ? result.route === 'query'
          ? '目标代理已选定并尝试查询'
          : '目标代理已选定并尝试下发'
        : '理解完成后进入这一步';
    case 'feedback':
      if (snapshot.isAwaitingCommandResult || isPendingExecution(result)) {
        return 'Room-Agent 正在返回任务状态';
      }

      if (result?.taskInterrupted) {
        return result.taskState === 'auth-required' ? '等待完成鉴权' : '等待补充输入';
      }

      return result?.taskState
        ? '已收到任务级执行反馈'
        : '这里展示最终执行结果';
  }
}

function resolveStepState(options: {
  key: VoiceFlowStepKey;
  index: number;
  activeStep: VoiceFlowStepKey | null;
  failedStep: VoiceFlowStepKey | null;
  interruptedStep: VoiceFlowStepKey | null;
  hasTerminalResult: boolean;
}): VoiceFlowStepState {
  if (options.failedStep === options.key) {
    return 'error';
  }

  if (options.interruptedStep === options.key) {
    return 'paused';
  }

  if (options.activeStep === options.key) {
    return 'active';
  }

  if (options.activeStep) {
    return STEP_ORDER.indexOf(options.activeStep) > options.index ? 'complete' : 'idle';
  }

  if (options.failedStep) {
    return STEP_ORDER.indexOf(options.failedStep) > options.index ? 'complete' : 'idle';
  }

  return options.hasTerminalResult ? 'complete' : 'idle';
}

function isPendingExecution(result: VoiceCommandExecutionResult | null): boolean {
  return Boolean(result?.taskState && result.taskTerminal === false && result.taskInterrupted !== true);
}
