import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ScreenShell } from '@/features/shared/screen-shell';
import { SectionCard } from '@/features/shared/section-card';
import { formatTaskActionCallbackQueryValue } from '@/features/voice-control/task-action-callback';
import type {
  RoomAgentSnapshot,
  TaskActionCallbackResult,
  VoiceCommandExecutionResult,
} from '@/types';
import { buildVoiceFlowInsights } from '@/features/voice-control/voice-flow-insights';
import { formatTaskStateLabel } from '@/features/voice-control/task-state';

type VoiceControlScreenProps = {
  currentRoomName: string | null;
  isConnected: boolean;
  isRecording: boolean;
  statusText: string;
  transcript: string;
  responsePreview: string;
  isRecognizingSpeech: boolean;
  commandDraft: string;
  taskFollowUpDraft: string;
  isExecutingCommand: boolean;
  isAwaitingCommandResult: boolean;
  lastCommandExecution: VoiceCommandExecutionResult | null;
  isRecoveredInterruptedTask: boolean;
  recoveredInterruptedTaskAt: number | null;
  commandExecutionHistory: VoiceCommandExecutionResult[];
  roomAgentSnapshot: RoomAgentSnapshot | null;
  latestTaskActionCallback: TaskActionCallbackResult | null;
  onChangeCommandDraft?: (value: string) => void;
  onChangeTaskFollowUpDraft?: (value: string) => void;
  onSubmitCommandDraft?: () => void;
  onSubmitTaskFollowUp?: () => void;
  onOpenTaskAction?: () => void;
  onToggleRecording?: () => void;
};

export function VoiceControlScreen({
  currentRoomName,
  isConnected,
  isRecording,
  statusText,
  transcript,
  responsePreview,
  isRecognizingSpeech,
  commandDraft,
  taskFollowUpDraft,
  isExecutingCommand,
  isAwaitingCommandResult,
  lastCommandExecution,
  isRecoveredInterruptedTask,
  recoveredInterruptedTaskAt,
  commandExecutionHistory,
  roomAgentSnapshot,
  latestTaskActionCallback,
  onChangeCommandDraft,
  onChangeTaskFollowUpDraft,
  onSubmitCommandDraft,
  onSubmitTaskFollowUp,
  onOpenTaskAction,
  onToggleRecording,
}: VoiceControlScreenProps) {
  const routeLabel = resolveRouteLabel(lastCommandExecution?.route);
  const isCommandBusy = isExecutingCommand || isRecognizingSpeech || isAwaitingCommandResult;
  const recordButtonLabel = isRecognizingSpeech ? '识别中' : isRecording ? '停止录音' : '开始录音';
  const taskStateLabel = formatTaskStateLabel(lastCommandExecution?.taskState);
  const canResumeTask = Boolean(
    lastCommandExecution?.taskInterrupted &&
      lastCommandExecution.taskId &&
      lastCommandExecution.taskContextId &&
      lastCommandExecution.roomId
  );
  const taskFollowUpPlaceholder =
    lastCommandExecution?.taskState === 'auth-required'
      ? '例如：我已完成鉴权，请继续执行。'
      : '例如：亮度改成 80%，色温偏暖。';
  const executionTone = resolveExecutionTone(lastCommandExecution);
  const taskActionLabel =
    lastCommandExecution?.taskAction?.label ??
    (lastCommandExecution?.taskState === 'auth-required' ? '打开鉴权页面' : '查看补充要求');
  const flowInsights = buildVoiceFlowInsights({
    isRecording,
    isRecognizingSpeech,
    isExecutingCommand,
    isAwaitingCommandResult,
    lastCommandExecution,
  });
  const callbackQueryEntries = latestTaskActionCallback
    ? Object.entries(latestTaskActionCallback.queryParams)
    : [];

  return (
    <ScreenShell
      eyebrow="Voice Control"
      title="语音控制"
      subtitle="录音、ASR、意图解析、路由和执行结果现在共用同一条执行主链路。">
      <SectionCard title="连接状态">
        <View style={styles.statusRow}>
          <StatusBadge label={currentRoomName ?? '未绑定房间'} tone="neutral" />
          <StatusBadge label={isConnected ? '控制通道已连接' : '控制通道待接入'} tone="accent" />
          <StatusBadge label={isRecognizingSpeech ? 'ASR 识别中' : 'ASR 已接入'} tone="neutral" />
        </View>
        <ThemedText style={styles.statusText}>{statusText}</ThemedText>
      </SectionCard>

      <SectionCard title="会话流">
        <MessageBubble label="识别文本" content={transcript} />
        <MessageBubble label="执行反馈" content={responsePreview} tone="dark" />
      </SectionCard>

      <SectionCard
        title="Room-Agent 快照"
        description="这里展示 agent-card 返回的代理描述，用来区分“可路由能力”与“任务执行结果”。">
        {roomAgentSnapshot ? (
          <View style={styles.snapshotCard}>
            <View style={styles.snapshotHeader}>
              <View style={styles.snapshotTitleBlock}>
                <ThemedText style={styles.snapshotTitle}>
                  {roomAgentSnapshot.agentName ??
                    roomAgentSnapshot.roomName ??
                    roomAgentSnapshot.roomId ??
                    '当前 Room-Agent'}
                </ThemedText>
                <ThemedText style={styles.snapshotTimestamp}>
                  {formatExecutionTime(roomAgentSnapshot.updatedAt)} 刷新
                </ThemedText>
              </View>
              <StatusBadge label="agent-card" tone="accent" />
            </View>

            <View style={styles.snapshotMetaRow}>
              <ResultChip label="代理" value={roomAgentSnapshot.agentId ?? '未返回'} />
              <ResultChip label="类型" value={roomAgentSnapshot.agentType ?? 'room'} />
              <ResultChip label="版本" value={roomAgentSnapshot.agentVersion ?? '未声明'} />
              <ResultChip label="设备" value={`${roomAgentSnapshot.devices.length} 个`} />
              <ResultChip label="能力" value={`${roomAgentSnapshot.capabilities.length} 类`} />
              <ResultChip label="技能" value={`${roomAgentSnapshot.skills.length} 个`} />
            </View>

            {roomAgentSnapshot.agentDescription ? (
              <View style={styles.snapshotSummaryCard}>
                <ThemedText style={styles.snapshotSummaryLabel}>AgentCard 描述</ThemedText>
                <ThemedText style={styles.snapshotSummaryText}>
                  {roomAgentSnapshot.agentDescription}
                </ThemedText>
              </View>
            ) : null}

            <ThemedText style={styles.snapshotNote}>{roomAgentSnapshot.note}</ThemedText>

            {roomAgentSnapshot.capabilities.length ? (
              <View style={styles.snapshotCapabilitiesRow}>
                {roomAgentSnapshot.capabilities.map(item => (
                  <View key={item} style={styles.snapshotCapabilityChip}>
                    <ThemedText style={styles.snapshotCapabilityText}>{item}</ThemedText>
                  </View>
                ))}
              </View>
            ) : null}

            {roomAgentSnapshot.skills.length ? (
              <View style={styles.snapshotSkillList}>
                {roomAgentSnapshot.skills.map(skill => (
                  <View key={skill.id} style={styles.snapshotSkillCard}>
                    <View style={styles.snapshotSkillHeader}>
                      <ThemedText style={styles.snapshotSkillName}>{skill.name}</ThemedText>
                      <StatusBadge label={skill.id} tone="neutral" />
                    </View>
                    {skill.description ? (
                      <ThemedText style={styles.snapshotSkillDescription}>
                        {skill.description}
                      </ThemedText>
                    ) : null}
                    {skill.tags.length ? (
                      <View style={styles.snapshotSkillTagRow}>
                        {skill.tags.map(tag => (
                          <View key={tag} style={styles.snapshotSkillTag}>
                            <ThemedText style={styles.snapshotSkillTagText}>{tag}</ThemedText>
                          </View>
                        ))}
                      </View>
                    ) : null}
                  </View>
                ))}
              </View>
            ) : null}

            {roomAgentSnapshot.devices.length ? (
              <View style={styles.snapshotDeviceList}>
                {roomAgentSnapshot.devices.map(device => (
                  <View key={device.id} style={styles.snapshotDeviceCard}>
                    <ThemedText style={styles.snapshotDeviceName}>{device.name}</ThemedText>
                    <ThemedText style={styles.snapshotDeviceMeta}>
                      {device.type ?? 'unknown'} · {device.id}
                    </ThemedText>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : (
          <View style={styles.emptySnapshotCard}>
            <ThemedText style={styles.emptySnapshotTitle}>还没有 Room-Agent 描述快照</ThemedText>
            <ThemedText style={styles.emptySnapshotDescription}>
              完成一次 room-agent discovery 和探活后，这里会展示 agent-card 返回的设备与能力信息。
            </ThemedText>
          </View>
        )}
      </SectionCard>

      <SectionCard
        title="执行轨迹"
        description="把输入、理解、下发、回流拆开显示，联调时可以更快定位当前卡点。">
        <View style={styles.flowGrid}>
          {flowInsights.steps.map(step => (
            <View
              key={step.key}
              style={[
                styles.flowStepCard,
                step.state === 'active'
                  ? styles.flowStepCardActive
                  : step.state === 'paused'
                    ? styles.flowStepCardPaused
                  : step.state === 'complete'
                    ? styles.flowStepCardComplete
                    : step.state === 'error'
                      ? styles.flowStepCardError
                      : styles.flowStepCardIdle,
              ]}>
              <ThemedText
                style={[
                  styles.flowStepLabel,
                  step.state === 'active' && styles.flowStepLabelActive,
                  step.state === 'paused' && styles.flowStepLabelPaused,
                ]}>
                {step.label}
              </ThemedText>
              <ThemedText
                style={[
                  styles.flowStepNote,
                  step.state === 'active' && styles.flowStepNoteActive,
                  step.state === 'paused' && styles.flowStepNotePaused,
                ]}>
                {step.note}
              </ThemedText>
            </View>
          ))}
        </View>

        <View style={styles.flowSummaryCard}>
          <View style={styles.flowSummaryHeader}>
            <ThemedText style={styles.flowSummaryTitle}>{flowInsights.title}</ThemedText>
            {taskStateLabel ? <StatusBadge label={taskStateLabel} tone="accent" /> : null}
          </View>
          <ThemedText style={styles.flowSummaryDetail}>{flowInsights.detail}</ThemedText>
        </View>
      </SectionCard>

      <SectionCard
        title="调试指令"
        description="文本调试仍然保留，用来在录音链路之外直接复用 Intent / Discovery / A2A 主执行路径。">
        <View style={styles.debugPanel}>
          <View style={styles.debugHeader}>
            <StatusBadge label={currentRoomName ?? '未绑定房间'} tone="neutral" />
            <StatusBadge label={routeLabel} tone="accent" />
            {taskStateLabel ? <StatusBadge label={taskStateLabel} tone="neutral" /> : null}
          </View>

          <TextInput
            value={commandDraft}
            onChangeText={onChangeCommandDraft}
            placeholder="例如：打开客厅主灯亮度调到80"
            placeholderTextColor="#8A8D86"
            multiline
            numberOfLines={4}
            maxLength={120}
            accessibilityLabel="语音调试指令输入框"
            style={styles.commandInput}
            textAlignVertical="top"
          />

          <Pressable
            onPress={onSubmitCommandDraft}
            disabled={isCommandBusy}
            accessibilityLabel="执行调试指令"
            accessibilityState={{ disabled: isCommandBusy, busy: isCommandBusy }}
            style={({ pressed }) => [
              styles.submitButton,
              pressed && !isCommandBusy && styles.submitButtonPressed,
              isCommandBusy && styles.submitButtonDisabled,
            ]}>
            {isCommandBusy ? (
              <View style={styles.submitBusyRow}>
                <ActivityIndicator color="#FFF5EC" />
                <ThemedText style={styles.submitButtonText}>
                  {isRecognizingSpeech ? '识别中' : '执行中'}
                </ThemedText>
              </View>
            ) : (
              <ThemedText style={styles.submitButtonText}>执行文本指令</ThemedText>
            )}
          </Pressable>

          {lastCommandExecution ? (
            <View style={styles.resultPanel}>
              <View style={styles.resultHeader}>
                <ThemedText style={styles.resultTitle}>{lastCommandExecution.status}</ThemedText>
                <View
                  style={[
                    styles.executionPill,
                    executionTone === 'success'
                      ? styles.executionPillSuccess
                      : executionTone === 'attention'
                        ? styles.executionPillAttention
                      : executionTone === 'pending'
                        ? styles.executionPillPending
                        : styles.executionPillError,
                  ]}>
                  <ThemedText style={styles.executionPillText}>
                    {executionTone === 'success'
                      ? 'SUCCESS'
                      : executionTone === 'attention'
                        ? 'ACTION'
                      : executionTone === 'pending'
                        ? 'PENDING'
                        : 'FAILED'}
                  </ThemedText>
                </View>
              </View>

              <View style={styles.resultChipRow}>
                <ResultChip label="路由" value={routeLabel} />
                {taskStateLabel ? <ResultChip label="任务" value={taskStateLabel} /> : null}
                <ResultChip
                  label="置信度"
                  value={`${Math.round(lastCommandExecution.intent.confidence * 100)}%`}
                />
                <ResultChip label="来源" value={lastCommandExecution.intent.source.toUpperCase()} />
              </View>

              <View style={styles.resultInfoGrid}>
                <ResultInfo
                  label="房间"
                  value={lastCommandExecution.roomName ?? lastCommandExecution.roomId ?? '未解析'}
                />
                <ResultInfo
                  label="代理"
                  value={lastCommandExecution.agentId ?? 'home-agent / unresolved'}
                />
                <ResultInfo
                  label="设备"
                  value={lastCommandExecution.intent.device ?? '未识别'}
                />
                <ResultInfo
                  label="动作"
                  value={lastCommandExecution.intent.action ?? '未识别'}
                />
              </View>

              <ThemedText style={styles.resultDetail}>{lastCommandExecution.detail}</ThemedText>

              {lastCommandExecution.taskInterrupted ? (
                <View style={styles.interruptionHintCard}>
                  {isRecoveredInterruptedTask ? (
                    <View style={styles.recoveryBadgeRow}>
                      <StatusBadge
                        label={`已恢复 · ${formatExecutionTime(
                          recoveredInterruptedTaskAt ?? lastCommandExecution.executedAt
                        )}`}
                        tone="accent"
                      />
                    </View>
                  ) : null}
                  <ThemedText style={styles.interruptionHintTitle}>
                    {lastCommandExecution.taskState === 'auth-required'
                      ? '需要先完成鉴权'
                      : '需要补充更多输入'}
                  </ThemedText>
                  <ThemedText style={styles.interruptionHintDetail}>
                    {lastCommandExecution.taskState === 'auth-required'
                      ? 'Room-Agent 当前已暂停这次任务，完成鉴权前不会继续轮询执行结果。'
                      : 'Room-Agent 当前已暂停这次任务，补充缺失参数前不会继续轮询执行结果。'}
                  </ThemedText>

                  {lastCommandExecution.taskAction?.url ? (
                    <View style={styles.actionLinkCard}>
                      <ThemedText style={styles.actionLinkTitle}>
                        {lastCommandExecution.taskState === 'auth-required'
                          ? '外部鉴权入口'
                          : '补充信息入口'}
                      </ThemedText>
                      <ThemedText style={styles.actionLinkDescription}>
                        {lastCommandExecution.taskAction.description ??
                          (lastCommandExecution.taskState === 'auth-required'
                            ? '先打开外部页面完成鉴权，再回到应用继续当前 task。'
                            : '先查看外部页面要求，再回到应用继续当前 task。')}
                      </ThemedText>
                      <Pressable
                        onPress={onOpenTaskAction}
                        disabled={isCommandBusy}
                        accessibilityLabel={taskActionLabel}
                        accessibilityState={{ disabled: isCommandBusy, busy: isCommandBusy }}
                        style={({ pressed }) => [
                          styles.actionLinkButton,
                          pressed && !isCommandBusy && styles.actionLinkButtonPressed,
                          isCommandBusy && styles.actionLinkButtonDisabled,
                        ]}>
                        <ThemedText style={styles.actionLinkButtonText}>
                          {taskActionLabel}
                        </ThemedText>
                      </Pressable>
                    </View>
                  ) : null}

                  {latestTaskActionCallback ? (
                    <View style={styles.callbackCard}>
                      <View style={styles.callbackHeader}>
                        <ThemedText style={styles.callbackTitle}>已捕获页面回跳</ThemedText>
                        <StatusBadge
                          label={formatExecutionTime(latestTaskActionCallback.receivedAt)}
                          tone="accent"
                        />
                      </View>

                      <View style={styles.callbackMetaRow}>
                        <ResultChip
                          label="路径"
                          value={
                            latestTaskActionCallback.path ??
                            latestTaskActionCallback.hostname ??
                            '应用根入口'
                          }
                        />
                        <ResultChip
                          label="参数"
                          value={`${callbackQueryEntries.length} 项`}
                        />
                      </View>

                      <ThemedText style={styles.callbackUrlText}>
                        {latestTaskActionCallback.rawUrl}
                      </ThemedText>

                      {callbackQueryEntries.length ? (
                        <View style={styles.callbackParamList}>
                          {callbackQueryEntries.map(([key, value]) => (
                            <View key={key} style={styles.callbackParamCard}>
                              <ThemedText style={styles.callbackParamKey}>{key}</ThemedText>
                              <ThemedText style={styles.callbackParamValue}>
                                {formatTaskActionCallbackQueryValue(value)}
                              </ThemedText>
                            </View>
                          ))}
                        </View>
                      ) : (
                        <ThemedText style={styles.callbackEmptyText}>
                          这次回跳没有携带可解析参数，继续任务时会只带上回跳地址。
                        </ThemedText>
                      )}
                    </View>
                  ) : null}

                  {canResumeTask ? (
                    <View style={styles.followUpComposer}>
                      <ThemedText style={styles.followUpLabel}>
                        {lastCommandExecution.taskState === 'auth-required'
                          ? '补充鉴权确认'
                          : '补充任务参数'}
                      </ThemedText>
                      <TextInput
                        value={taskFollowUpDraft}
                        onChangeText={onChangeTaskFollowUpDraft}
                        placeholder={taskFollowUpPlaceholder}
                        placeholderTextColor="#93A7A1"
                        multiline
                        numberOfLines={3}
                        maxLength={120}
                        editable={!isCommandBusy}
                        accessibilityLabel="继续当前任务的补充输入"
                        style={styles.followUpInput}
                        textAlignVertical="top"
                      />
                      <View style={styles.followUpMetaRow}>
                        <ThemedText style={styles.followUpMetaText}>
                          继续当前 task，不会新开一个 Room-Agent 任务。
                        </ThemedText>
                        <Pressable
                          onPress={onSubmitTaskFollowUp}
                          disabled={isCommandBusy || taskFollowUpDraft.trim().length === 0}
                          accessibilityLabel="继续当前 Room-Agent 任务"
                          accessibilityState={{
                            disabled: isCommandBusy || taskFollowUpDraft.trim().length === 0,
                            busy: isCommandBusy,
                          }}
                          style={({ pressed }) => [
                            styles.followUpButton,
                            pressed &&
                              !isCommandBusy &&
                              taskFollowUpDraft.trim().length > 0 &&
                              styles.followUpButtonPressed,
                            (isCommandBusy || taskFollowUpDraft.trim().length === 0) &&
                              styles.followUpButtonDisabled,
                          ]}>
                          {isCommandBusy ? (
                            <View style={styles.followUpBusyRow}>
                              <ActivityIndicator color="#17332F" />
                              <ThemedText style={styles.followUpButtonText}>继续中</ThemedText>
                            </View>
                          ) : (
                            <ThemedText style={styles.followUpButtonText}>继续任务</ThemedText>
                          )}
                        </Pressable>
                      </View>
                    </View>
                  ) : (
                    <ThemedText style={styles.followUpUnsupportedText}>
                      当前缺少 task 上下文，暂时无法基于同一任务继续执行。
                    </ThemedText>
                  )}
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      </SectionCard>

      <SectionCard
        title="最近执行"
        description="保留最近几次路由结果，方便区分 discovery、连接探活和命令下发分别卡在哪一步。">
        {commandExecutionHistory.length ? (
          <View style={styles.historyList}>
            {commandExecutionHistory.map(item => (
              <View key={`${item.executedAt}-${item.input}`} style={styles.historyCard}>
                <View style={styles.historyHeader}>
                  <View style={styles.historyTitleBlock}>
                    <ThemedText style={styles.historyTitle}>{item.status}</ThemedText>
                    <ThemedText style={styles.historyTimestamp}>
                      {formatExecutionTime(item.executedAt)}
                    </ThemedText>
                  </View>
                  <View
                    style={[
                    styles.historyStatePill,
                    resolveExecutionTone(item) === 'success'
                      ? styles.historyStatePillSuccess
                      : resolveExecutionTone(item) === 'attention'
                        ? styles.historyStatePillAttention
                      : resolveExecutionTone(item) === 'pending'
                          ? styles.historyStatePillPending
                          : styles.historyStatePillError,
                    ]}>
                    <ThemedText style={styles.historyStatePillText}>
                      {resolveExecutionTone(item) === 'success'
                        ? 'SUCCESS'
                        : resolveExecutionTone(item) === 'attention'
                          ? 'ACTION'
                        : resolveExecutionTone(item) === 'pending'
                          ? 'PENDING'
                          : 'FAILED'}
                    </ThemedText>
                  </View>
                </View>

                <View style={styles.historyMetaRow}>
                  <ResultChip
                    label="路由"
                    value={resolveRouteLabel(item.route)}
                  />
                  <ResultChip
                    label="房间"
                    value={item.roomName ?? item.roomId ?? '未解析'}
                  />
                  <ResultChip
                    label="动作"
                    value={item.intent.action ?? '未识别'}
                  />
                  {item.taskState ? (
                    <ResultChip label="任务" value={formatTaskStateLabel(item.taskState) ?? '未知'} />
                  ) : null}
                </View>

                <ThemedText style={styles.historyInput}>{item.input}</ThemedText>
                <ThemedText style={styles.historyDetail}>{item.detail}</ThemedText>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.emptyHistoryCard}>
            <ThemedText style={styles.emptyHistoryTitle}>还没有执行记录</ThemedText>
            <ThemedText style={styles.emptyHistoryDescription}>
              先运行一条文本调试指令，系统会把最近几次结果保存在这里。
            </ThemedText>
          </View>
        )}
      </SectionCard>

      <Pressable
        onPress={onToggleRecording}
        disabled={isCommandBusy}
        accessibilityState={{ disabled: isCommandBusy, busy: isCommandBusy }}
        style={({ pressed }) => [
          styles.recordButton,
          pressed && !isCommandBusy && styles.recordButtonPressed,
          isCommandBusy && styles.recordButtonDisabled,
        ]}>
        <ThemedText style={styles.recordIcon}>{isRecording ? '■' : '●'}</ThemedText>
        <ThemedText style={styles.recordLabel}>{recordButtonLabel}</ThemedText>
      </Pressable>
    </ScreenShell>
  );
}

function ResultChip({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.resultChip}>
      <ThemedText style={styles.resultChipLabel}>{label}</ThemedText>
      <ThemedText style={styles.resultChipValue}>{value}</ThemedText>
    </View>
  );
}

function ResultInfo({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.resultInfoCard}>
      <ThemedText style={styles.resultInfoLabel}>{label}</ThemedText>
      <ThemedText style={styles.resultInfoValue}>{value}</ThemedText>
    </View>
  );
}

function StatusBadge({ label, tone }: { label: string; tone: 'accent' | 'neutral' }) {
  return (
    <View style={[styles.badge, tone === 'accent' && styles.badgeAccent]}>
      <ThemedText style={styles.badgeText}>{label}</ThemedText>
    </View>
  );
}

function MessageBubble({
  label,
  content,
  tone = 'light',
}: {
  label: string;
  content: string;
  tone?: 'light' | 'dark';
}) {
  return (
    <View style={[styles.messageBubble, tone === 'dark' && styles.messageBubbleDark]}>
      <ThemedText style={[styles.messageLabel, tone === 'dark' && styles.messageLabelDark]}>
        {label}
      </ThemedText>
      <ThemedText style={[styles.messageContent, tone === 'dark' && styles.messageContentDark]}>
        {content}
      </ThemedText>
    </View>
  );
}

function formatExecutionTime(timestamp: number): string {
  const value = new Date(timestamp);
  const hours = String(value.getHours()).padStart(2, '0');
  const minutes = String(value.getMinutes()).padStart(2, '0');
  const seconds = String(value.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

function resolveExecutionTone(
  result: VoiceCommandExecutionResult | null
): 'pending' | 'attention' | 'success' | 'error' {
  if (!result) {
    return 'pending';
  }

  if (result.taskInterrupted) {
    return 'attention';
  }

  if (result.taskState && result.taskTerminal === false) {
    return 'pending';
  }

  return result.success ? 'success' : 'error';
}

function resolveRouteLabel(
  route: VoiceCommandExecutionResult['route'] | null | undefined
): string {
  switch (route) {
    case 'home-agent':
      return 'Home-Agent';
    case 'query':
      return '设备查询';
    case 'chat':
      return '对话回复';
    case 'room-agent':
      return 'Room-Agent';
    default:
      return '待路由';
  }
}

const styles = StyleSheet.create({
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  snapshotCard: {
    padding: 14,
    gap: 12,
    backgroundColor: '#EAF2EE',
    borderRadius: 18,
    borderCurve: 'continuous',
  },
  snapshotHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  snapshotTitleBlock: {
    flex: 1,
    gap: 4,
  },
  snapshotTitle: {
    color: '#19322F',
    fontSize: 16,
    fontWeight: '800',
  },
  snapshotTimestamp: {
    color: '#60706A',
    fontSize: 12,
    fontWeight: '600',
  },
  snapshotMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  snapshotNote: {
    color: '#4E625C',
    lineHeight: 21,
  },
  snapshotSummaryCard: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 16,
    borderCurve: 'continuous',
    backgroundColor: '#F7FBF9',
    gap: 4,
  },
  snapshotSummaryLabel: {
    color: '#59706A',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  snapshotSummaryText: {
    color: '#19322F',
    lineHeight: 21,
  },
  snapshotCapabilitiesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  snapshotCapabilityChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderCurve: 'continuous',
    backgroundColor: '#D7E8DF',
  },
  snapshotCapabilityText: {
    color: '#21423B',
    fontSize: 13,
    fontWeight: '700',
  },
  snapshotSkillList: {
    gap: 10,
  },
  snapshotSkillCard: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 16,
    borderCurve: 'continuous',
    backgroundColor: '#F7FBF9',
    gap: 8,
  },
  snapshotSkillHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  snapshotSkillName: {
    flex: 1,
    color: '#17332F',
    fontSize: 14,
    fontWeight: '700',
  },
  snapshotSkillDescription: {
    color: '#5B6D67',
    lineHeight: 20,
  },
  snapshotSkillTagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  snapshotSkillTag: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderCurve: 'continuous',
    backgroundColor: '#E4EFEA',
  },
  snapshotSkillTagText: {
    color: '#325149',
    fontSize: 12,
    fontWeight: '700',
  },
  snapshotDeviceList: {
    gap: 10,
  },
  snapshotDeviceCard: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    borderCurve: 'continuous',
    backgroundColor: '#F7FBF9',
    gap: 4,
  },
  snapshotDeviceName: {
    color: '#17332F',
    fontSize: 14,
    fontWeight: '700',
  },
  snapshotDeviceMeta: {
    color: '#61716C',
    lineHeight: 19,
  },
  emptySnapshotCard: {
    padding: 16,
    gap: 6,
    backgroundColor: '#F6EFE5',
    borderRadius: 18,
    borderCurve: 'continuous',
  },
  emptySnapshotTitle: {
    color: '#1B2E2B',
    fontSize: 15,
    fontWeight: '700',
  },
  emptySnapshotDescription: {
    color: '#6B7D78',
    lineHeight: 20,
  },
  flowGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  flowStepCard: {
    flexGrow: 1,
    flexBasis: '47%',
    minWidth: 136,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
    borderCurve: 'continuous',
    gap: 6,
  },
  flowStepCardIdle: {
    backgroundColor: '#F5EEDF',
  },
  flowStepCardActive: {
    backgroundColor: '#1E4A43',
  },
  flowStepCardPaused: {
    backgroundColor: '#EFD7B4',
  },
  flowStepCardComplete: {
    backgroundColor: '#DDECE5',
  },
  flowStepCardError: {
    backgroundColor: '#F1DDD0',
  },
  flowStepLabel: {
    color: '#23403A',
    fontSize: 14,
    fontWeight: '800',
  },
  flowStepLabelActive: {
    color: '#F8F1E8',
  },
  flowStepLabelPaused: {
    color: '#73491D',
  },
  flowStepNote: {
    color: '#62746F',
    lineHeight: 20,
  },
  flowStepNoteActive: {
    color: '#CEE2DB',
  },
  flowStepNotePaused: {
    color: '#875D30',
  },
  flowSummaryCard: {
    padding: 14,
    gap: 10,
    backgroundColor: '#F6EFE5',
    borderRadius: 18,
    borderCurve: 'continuous',
  },
  flowSummaryHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  flowSummaryTitle: {
    flex: 1,
    color: '#19322F',
    fontSize: 16,
    fontWeight: '800',
  },
  flowSummaryDetail: {
    color: '#586863',
    lineHeight: 21,
  },
  debugPanel: {
    gap: 12,
  },
  debugHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#F0E6D8',
    borderRadius: 999,
    borderCurve: 'continuous',
  },
  badgeAccent: {
    backgroundColor: '#D9EDE4',
  },
  badgeText: {
    color: '#314541',
    fontSize: 13,
    fontWeight: '600',
  },
  statusText: {
    color: '#5F706C',
    lineHeight: 20,
  },
  messageBubble: {
    padding: 14,
    gap: 8,
    backgroundColor: '#F6EFE5',
    borderRadius: 18,
    borderCurve: 'continuous',
  },
  messageBubbleDark: {
    backgroundColor: '#24443F',
  },
  messageLabel: {
    color: '#6B7D78',
    fontWeight: '600',
  },
  messageLabelDark: {
    color: '#BFD8D0',
  },
  messageContent: {
    color: '#1B2E2B',
    lineHeight: 21,
  },
  messageContentDark: {
    color: '#F4EFE7',
  },
  commandInput: {
    minHeight: 118,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#F1E8D9',
    borderRadius: 20,
    borderCurve: 'continuous',
    color: '#1B2E2B',
    fontSize: 16,
    lineHeight: 22,
  },
  submitButton: {
    minHeight: 52,
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: '#B35136',
    borderRadius: 20,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonPressed: {
    transform: [{ scale: 0.98 }],
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitBusyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  submitButtonText: {
    color: '#FFF5EC',
    fontSize: 16,
    fontWeight: '700',
  },
  resultPanel: {
    padding: 14,
    gap: 12,
    backgroundColor: '#183733',
    borderRadius: 20,
    borderCurve: 'continuous',
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  resultTitle: {
    color: '#F9F3EA',
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  executionPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderCurve: 'continuous',
  },
  executionPillSuccess: {
    backgroundColor: '#245849',
  },
  executionPillPending: {
    backgroundColor: '#6A5125',
  },
  executionPillAttention: {
    backgroundColor: '#8A5D1F',
  },
  executionPillError: {
    backgroundColor: '#5A4930',
  },
  executionPillText: {
    color: '#F9F3EA',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  resultChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  resultChip: {
    minWidth: 92,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 14,
    borderCurve: 'continuous',
    backgroundColor: '#21413B',
    gap: 2,
  },
  resultChipLabel: {
    color: '#8EB2A6',
    fontSize: 11,
    fontWeight: '600',
  },
  resultChipValue: {
    color: '#F6EFE5',
    fontSize: 13,
    fontWeight: '700',
  },
  resultInfoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  resultInfoCard: {
    flexGrow: 1,
    flexBasis: '47%',
    minWidth: 132,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    borderCurve: 'continuous',
    backgroundColor: '#21413B',
    gap: 4,
  },
  resultInfoLabel: {
    color: '#8EB2A6',
    fontSize: 12,
    fontWeight: '600',
  },
  resultInfoValue: {
    color: '#F6EFE5',
    fontSize: 14,
    fontWeight: '700',
  },
  resultMeta: {
    color: '#C3D8CF',
    lineHeight: 20,
  },
  resultDetail: {
    color: '#F6EFE5',
    lineHeight: 21,
  },
  interruptionHintCard: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 16,
    borderCurve: 'continuous',
    backgroundColor: '#2B4B45',
    gap: 4,
  },
  recoveryBadgeRow: {
    marginBottom: 4,
    flexDirection: 'row',
  },
  interruptionHintTitle: {
    color: '#F7E4C2',
    fontSize: 13,
    fontWeight: '800',
  },
  interruptionHintDetail: {
    color: '#D9E3DE',
    lineHeight: 20,
  },
  actionLinkCard: {
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 16,
    borderCurve: 'continuous',
    backgroundColor: '#35534C',
    gap: 8,
  },
  actionLinkTitle: {
    color: '#F6E2BC',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  actionLinkDescription: {
    color: '#D7E3DE',
    lineHeight: 20,
  },
  actionLinkButton: {
    minHeight: 46,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderCurve: 'continuous',
    backgroundColor: '#C7E3D7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLinkButtonPressed: {
    transform: [{ scale: 0.98 }],
  },
  actionLinkButtonDisabled: {
    opacity: 0.64,
  },
  actionLinkButtonText: {
    color: '#17332F',
    fontSize: 14,
    fontWeight: '800',
  },
  callbackCard: {
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 16,
    borderCurve: 'continuous',
    backgroundColor: '#1F3D38',
    gap: 10,
  },
  callbackHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  callbackTitle: {
    color: '#F2E6D0',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  callbackMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  callbackUrlText: {
    color: '#C5D7D1',
    fontSize: 12,
    lineHeight: 18,
  },
  callbackParamList: {
    gap: 8,
  },
  callbackParamCard: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderCurve: 'continuous',
    backgroundColor: '#294A44',
    gap: 4,
  },
  callbackParamKey: {
    color: '#8EB2A6',
    fontSize: 11,
    fontWeight: '700',
  },
  callbackParamValue: {
    color: '#F6EFE5',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  callbackEmptyText: {
    color: '#B8CCC5',
    lineHeight: 19,
  },
  followUpComposer: {
    marginTop: 8,
    gap: 10,
  },
  followUpLabel: {
    color: '#F7E4C2',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  followUpInput: {
    minHeight: 94,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#355A53',
    borderRadius: 16,
    borderCurve: 'continuous',
    color: '#F6EFE5',
    fontSize: 15,
    lineHeight: 21,
  },
  followUpMetaRow: {
    gap: 10,
  },
  followUpMetaText: {
    color: '#B8CCC5',
    lineHeight: 19,
  },
  followUpButton: {
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#E9C48C',
    borderRadius: 16,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  followUpButtonPressed: {
    transform: [{ scale: 0.98 }],
  },
  followUpButtonDisabled: {
    opacity: 0.64,
  },
  followUpBusyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  followUpButtonText: {
    color: '#17332F',
    fontSize: 15,
    fontWeight: '800',
  },
  followUpUnsupportedText: {
    color: '#B8CCC5',
    lineHeight: 20,
  },
  historyList: {
    gap: 10,
  },
  historyCard: {
    padding: 14,
    gap: 10,
    backgroundColor: '#F4EBDD',
    borderRadius: 18,
    borderCurve: 'continuous',
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  historyTitleBlock: {
    flex: 1,
    gap: 4,
  },
  historyTitle: {
    color: '#1D332F',
    fontSize: 15,
    fontWeight: '700',
  },
  historyTimestamp: {
    color: '#6A7A75',
    fontSize: 12,
    fontWeight: '600',
  },
  historyStatePill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderCurve: 'continuous',
  },
  historyStatePillSuccess: {
    backgroundColor: '#D8EBE2',
  },
  historyStatePillPending: {
    backgroundColor: '#E9D8AE',
  },
  historyStatePillAttention: {
    backgroundColor: '#E9CFA1',
  },
  historyStatePillError: {
    backgroundColor: '#EFD9CC',
  },
  historyStatePillText: {
    color: '#1D332F',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  historyMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  historyInput: {
    color: '#23403A',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  historyDetail: {
    color: '#556761',
    lineHeight: 20,
  },
  emptyHistoryCard: {
    padding: 16,
    gap: 6,
    backgroundColor: '#F6EFE5',
    borderRadius: 18,
    borderCurve: 'continuous',
  },
  emptyHistoryTitle: {
    color: '#1B2E2B',
    fontSize: 15,
    fontWeight: '700',
  },
  emptyHistoryDescription: {
    color: '#6B7D78',
    lineHeight: 20,
  },
  recordButton: {
    paddingVertical: 18,
    paddingHorizontal: 22,
    backgroundColor: '#C95C3A',
    borderRadius: 28,
    borderCurve: 'continuous',
    alignItems: 'center',
    gap: 6,
  },
  recordButtonPressed: {
    transform: [{ scale: 0.98 }],
  },
  recordButtonDisabled: {
    opacity: 0.72,
  },
  recordIcon: {
    color: '#FFF5EC',
    fontSize: 28,
    fontWeight: '800',
  },
  recordLabel: {
    color: '#FFF5EC',
    fontSize: 17,
    fontWeight: '700',
  },
});
