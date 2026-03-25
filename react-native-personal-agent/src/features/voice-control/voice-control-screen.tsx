import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ScreenShell } from '@/features/shared/screen-shell';
import { SectionCard } from '@/features/shared/section-card';
import type { VoiceCommandExecutionResult } from '@/types';

type VoiceControlScreenProps = {
  currentRoomName: string | null;
  isConnected: boolean;
  isRecording: boolean;
  statusText: string;
  transcript: string;
  responsePreview: string;
  commandDraft: string;
  isSubmittingCommand: boolean;
  lastCommandExecution: VoiceCommandExecutionResult | null;
  onChangeCommandDraft?: (value: string) => void;
  onSubmitCommandDraft?: () => void;
  onToggleRecording?: () => void;
};

export function VoiceControlScreen({
  currentRoomName,
  isConnected,
  isRecording,
  statusText,
  transcript,
  responsePreview,
  commandDraft,
  isSubmittingCommand,
  lastCommandExecution,
  onChangeCommandDraft,
  onSubmitCommandDraft,
  onToggleRecording,
}: VoiceControlScreenProps) {
  const routeLabel =
    lastCommandExecution?.route === 'home-agent'
      ? 'Home-Agent'
      : lastCommandExecution?.route === 'room-agent'
        ? 'Room-Agent'
        : '待路由';

  return (
    <ScreenShell
      eyebrow="Voice Control"
      title="语音控制"
      subtitle="录音、ASR、意图解析、路由和执行结果会沿这条主链路逐步接通。">
      <SectionCard title="连接状态">
        <View style={styles.statusRow}>
          <StatusBadge label={currentRoomName ?? '未绑定房间'} tone="neutral" />
          <StatusBadge label={isConnected ? '控制通道已连接' : '控制通道待接入'} tone="accent" />
        </View>
        <ThemedText style={styles.statusText}>{statusText}</ThemedText>
      </SectionCard>

      <SectionCard title="会话流">
        <MessageBubble label="识别文本" content={transcript} />
        <MessageBubble label="执行反馈" content={responsePreview} tone="dark" />
      </SectionCard>

      <SectionCard
        title="调试指令"
        description="在 ASR 闭环完成前，先用文本把 Intent / Discovery / A2A 控制链路联调起来。">
        <View style={styles.debugPanel}>
          <View style={styles.debugHeader}>
            <StatusBadge label={currentRoomName ?? '未绑定房间'} tone="neutral" />
            <StatusBadge label={routeLabel} tone="accent" />
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
            disabled={isSubmittingCommand}
            accessibilityLabel="执行调试指令"
            accessibilityState={{ disabled: isSubmittingCommand, busy: isSubmittingCommand }}
            style={({ pressed }) => [
              styles.submitButton,
              pressed && !isSubmittingCommand && styles.submitButtonPressed,
              isSubmittingCommand && styles.submitButtonDisabled,
            ]}>
            {isSubmittingCommand ? (
              <View style={styles.submitBusyRow}>
                <ActivityIndicator color="#FFF5EC" />
                <ThemedText style={styles.submitButtonText}>执行中</ThemedText>
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
                    lastCommandExecution.success
                      ? styles.executionPillSuccess
                      : styles.executionPillWarning,
                  ]}>
                  <ThemedText style={styles.executionPillText}>
                    {lastCommandExecution.success ? 'SUCCESS' : 'CHECK'}
                  </ThemedText>
                </View>
              </View>

              <View style={styles.resultChipRow}>
                <ResultChip label="路由" value={routeLabel} />
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
            </View>
          ) : null}
        </View>
      </SectionCard>

      <Pressable onPress={onToggleRecording} style={styles.recordButton}>
        <ThemedText style={styles.recordIcon}>{isRecording ? '■' : '●'}</ThemedText>
        <ThemedText style={styles.recordLabel}>{isRecording ? '停止录音' : '开始录音'}</ThemedText>
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

const styles = StyleSheet.create({
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
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
  executionPillWarning: {
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
  recordButton: {
    paddingVertical: 18,
    paddingHorizontal: 22,
    backgroundColor: '#C95C3A',
    borderRadius: 28,
    borderCurve: 'continuous',
    alignItems: 'center',
    gap: 6,
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
