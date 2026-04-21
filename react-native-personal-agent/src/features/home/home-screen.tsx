import { Pressable, StyleSheet, View } from 'react-native';

import { ScreenShell } from '@/features/shared/screen-shell';
import { SectionCard } from '@/features/shared/section-card';
import { ThemedText } from '@/components/themed-text';
import type { ConnectionStatus } from '@/types';

type QuickAction = {
  label: string;
  description: string;
  onPress: () => void;
};

type HomeScreenProps = {
  currentRoomName: string | null;
  controlStatus: ConnectionStatus;
  isScanningBeacon: boolean;
  backendLabel: string;
  quickActions: QuickAction[];
};

export function HomeScreen({
  currentRoomName,
  controlStatus,
  isScanningBeacon,
  backendLabel,
  quickActions,
}: HomeScreenProps) {
  return (
    <ScreenShell
      eyebrow="Personal Agent"
      title="随身入口"
      subtitle="先把房间绑定、语音控制和偏好管理迁到 React Native，再接通 room-agent 与 home-agent。">
      <SectionCard title="当前状态" description="对齐快应用首页的核心感知信息。">
        <View style={styles.statusGrid}>
          <StatusTile
            label="房间"
            value={
              currentRoomName ?? (isScanningBeacon ? '扫描附近 Beacon...' : '未绑定房间')
            }
            tone={currentRoomName ? 'accent' : 'neutral'}
          />
          <StatusTile
            label="A2A"
            value={
              controlStatus === 'connected'
                ? '已连接'
                : controlStatus === 'connecting'
                  ? '连接中'
                  : controlStatus === 'error'
                    ? '异常'
                    : '未连接'
            }
            tone={controlStatus === 'connected' ? 'accent' : 'warning'}
          />
          <StatusTile label="后端" value={backendLabel} tone="neutral" />
        </View>
      </SectionCard>

      <SectionCard title="主入口" description="用业务入口替换 Expo 示例页，保留联调所需的最短路径。">
        <View style={styles.actionList}>
          {quickActions.map(action => (
            <Pressable key={action.label} onPress={action.onPress} style={styles.actionCard}>
              <ThemedText style={styles.actionTitle}>{action.label}</ThemedText>
              <ThemedText style={styles.actionDescription}>{action.description}</ThemedText>
            </Pressable>
          ))}
        </View>
      </SectionCard>
    </ScreenShell>
  );
}

function StatusTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'accent' | 'warning' | 'neutral';
}) {
  return (
    <View style={[styles.statusTile, tone === 'accent' && styles.accentTile]}>
      <ThemedText style={styles.statusLabel}>{label}</ThemedText>
      <ThemedText style={styles.statusValue}>{value}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  statusGrid: {
    gap: 10,
  },
  statusTile: {
    padding: 14,
    gap: 6,
    backgroundColor: '#F5EEE3',
    borderRadius: 18,
    borderCurve: 'continuous',
  },
  accentTile: {
    backgroundColor: '#DDEEE7',
  },
  statusLabel: {
    color: '#5D726F',
    fontSize: 13,
    fontWeight: '600',
  },
  statusValue: {
    color: '#1B2E2B',
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
  },
  actionList: {
    gap: 10,
  },
  actionCard: {
    padding: 16,
    gap: 8,
    backgroundColor: '#1F5149',
    borderRadius: 20,
    borderCurve: 'continuous',
  },
  actionTitle: {
    color: '#F9F3EA',
    fontSize: 18,
    fontWeight: '700',
  },
  actionDescription: {
    color: '#CBE0D7',
    lineHeight: 20,
  },
});
