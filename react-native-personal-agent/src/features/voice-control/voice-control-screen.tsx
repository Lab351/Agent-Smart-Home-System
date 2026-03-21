import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ScreenShell } from '@/features/shared/screen-shell';
import { SectionCard } from '@/features/shared/section-card';

type VoiceControlScreenProps = {
  currentRoomName: string | null;
  isConnected: boolean;
  isRecording: boolean;
  statusText: string;
  transcript: string;
  responsePreview: string;
  onToggleRecording?: () => void;
};

export function VoiceControlScreen({
  currentRoomName,
  isConnected,
  isRecording,
  statusText,
  transcript,
  responsePreview,
  onToggleRecording,
}: VoiceControlScreenProps) {
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

      <Pressable onPress={onToggleRecording} style={styles.recordButton}>
        <ThemedText style={styles.recordIcon}>{isRecording ? '■' : '●'}</ThemedText>
        <ThemedText style={styles.recordLabel}>{isRecording ? '停止录音' : '开始录音'}</ThemedText>
      </Pressable>
    </ScreenShell>
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
