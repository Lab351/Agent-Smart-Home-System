import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ScreenShell } from '@/features/shared/screen-shell';
import { SectionCard } from '@/features/shared/section-card';
import type { BeaconScanIssue } from '@/types';

type BeaconPreview = {
  roomName: string;
  rssi: number;
  distance: number | null;
};

type BeaconDiagnosticPreview = {
  key: string;
  summary: string;
  detail: string;
};

type RoomBindingScreenProps = {
  currentRoomName: string | null;
  scanning: boolean;
  scanBusy?: boolean;
  scanStatusText: string;
  scanIssue?: BeaconScanIssue | null;
  discoveredBeacons: BeaconPreview[];
  diagnostics: BeaconDiagnosticPreview[];
  onToggleScan?: () => void;
  onUnbind?: () => void;
};

export function RoomBindingScreen({
  currentRoomName,
  scanning,
  scanBusy = false,
  scanStatusText,
  scanIssue,
  discoveredBeacons,
  diagnostics,
  onToggleScan,
  onUnbind,
}: RoomBindingScreenProps) {
  return (
    <ScreenShell
      eyebrow="Room Binding"
      title="房间绑定"
      subtitle="BLE Beacon 扫描会在这里沉淀成当前房间状态和可见邻近房间列表。">
      <SectionCard title="当前状态">
        <View style={styles.summaryCard}>
          <ThemedText style={styles.summaryLabel}>绑定房间</ThemedText>
          <ThemedText style={styles.summaryValue}>
            {currentRoomName ?? (scanning ? '扫描附近 Beacon...' : '尚未绑定')}
          </ThemedText>
          <ThemedText style={styles.summaryHint}>{scanStatusText}</ThemedText>
        </View>

        <View style={styles.buttonRow}>
          <Pressable
            disabled={scanBusy}
            onPress={onToggleScan}
            style={[styles.primaryButton, scanBusy ? styles.disabledButton : null]}>
            <ThemedText style={styles.primaryButtonText}>
              {scanBusy ? '启动中...' : scanning ? '停止扫描' : scanIssue ? '重试扫描' : '开始扫描'}
            </ThemedText>
          </Pressable>
          <Pressable
            disabled={scanBusy}
            onPress={onUnbind}
            style={[styles.secondaryButton, scanBusy ? styles.disabledButton : null]}>
            <ThemedText style={styles.secondaryButtonText}>
              {scanning ? '停止并解绑' : '解绑房间'}
            </ThemedText>
          </Pressable>
        </View>

        {scanIssue ? (
          <View style={styles.issueCard}>
            <ThemedText style={styles.issueTitle}>{scanIssue.summary}</ThemedText>
            <ThemedText style={styles.issueDetail}>{scanIssue.detail}</ThemedText>
          </View>
        ) : null}
      </SectionCard>

      <SectionCard title="附近 Beacon" description="首版先保留扫描结果展示与房间决策所需的信号信息。">
        <View style={styles.beaconList}>
          {!discoveredBeacons.length ? (
            <View style={styles.emptyState}>
              <ThemedText style={styles.emptyStateText}>{scanStatusText}</ThemedText>
            </View>
          ) : null}
          {discoveredBeacons.map(beacon => (
            <View key={`${beacon.roomName}-${beacon.rssi}`} style={styles.beaconItem}>
              <View style={styles.beaconHeader}>
                <ThemedText style={styles.beaconRoom}>{beacon.roomName}</ThemedText>
                <ThemedText style={styles.beaconRssi}>{beacon.rssi} dBm</ThemedText>
              </View>
              <ThemedText style={styles.beaconMeta}>
                {beacon.distance ? `估算距离 ${beacon.distance.toFixed(1)} m` : '距离待估算'}
              </ThemedText>
            </View>
          ))}
        </View>
      </SectionCard>

      <SectionCard title="扫描诊断" description="最近几条被忽略的广播会显示在这里，方便确认卡在哪一层。">
        <View style={styles.diagnosticList}>
          {!diagnostics.length ? (
            <View style={styles.emptyState}>
              <ThemedText style={styles.emptyStateText}>
                {scanning ? '当前还没有诊断信息。' : '开始扫描后会在这里显示最近的诊断结果。'}
              </ThemedText>
            </View>
          ) : null}
          {diagnostics.map(diagnostic => (
            <View key={diagnostic.key} style={styles.diagnosticItem}>
              <ThemedText style={styles.diagnosticSummary}>{diagnostic.summary}</ThemedText>
              <ThemedText style={styles.diagnosticDetail}>{diagnostic.detail}</ThemedText>
            </View>
          ))}
        </View>
      </SectionCard>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  summaryCard: {
    padding: 16,
    gap: 8,
    backgroundColor: '#EEF4EF',
    borderRadius: 20,
    borderCurve: 'continuous',
  },
  summaryLabel: {
    color: '#60706A',
    fontWeight: '600',
  },
  summaryValue: {
    color: '#17342E',
    fontSize: 22,
    fontWeight: '700',
  },
  summaryHint: {
    color: '#687A76',
    lineHeight: 20,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  primaryButton: {
    flex: 1,
    paddingVertical: 14,
    backgroundColor: '#24574E',
    borderRadius: 20,
    borderCurve: 'continuous',
    alignItems: 'center',
  },
  disabledButton: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: '#F7F1E9',
    fontWeight: '700',
  },
  secondaryButton: {
    flex: 1,
    paddingVertical: 14,
    backgroundColor: '#EDE3D4',
    borderRadius: 20,
    borderCurve: 'continuous',
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#29403C',
    fontWeight: '700',
  },
  issueCard: {
    padding: 14,
    gap: 6,
    backgroundColor: '#F7E3D2',
    borderRadius: 18,
    borderCurve: 'continuous',
  },
  issueTitle: {
    color: '#7A2F18',
    fontWeight: '700',
  },
  issueDetail: {
    color: '#7A4A36',
    lineHeight: 20,
  },
  beaconList: {
    gap: 10,
  },
  emptyState: {
    padding: 14,
    backgroundColor: '#F4F0EA',
    borderRadius: 18,
    borderCurve: 'continuous',
  },
  emptyStateText: {
    color: '#687A76',
    lineHeight: 20,
  },
  beaconItem: {
    padding: 14,
    gap: 8,
    backgroundColor: '#F7F1E8',
    borderRadius: 18,
    borderCurve: 'continuous',
  },
  beaconHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  beaconRoom: {
    color: '#17342E',
    fontSize: 17,
    fontWeight: '700',
  },
  beaconRssi: {
    color: '#A25239',
    fontWeight: '700',
  },
  beaconMeta: {
    color: '#687A76',
  },
  diagnosticList: {
    gap: 10,
  },
  diagnosticItem: {
    padding: 14,
    gap: 6,
    backgroundColor: '#EEF4EF',
    borderRadius: 18,
    borderCurve: 'continuous',
  },
  diagnosticSummary: {
    color: '#17342E',
    fontWeight: '700',
  },
  diagnosticDetail: {
    color: '#60706A',
    lineHeight: 20,
  },
});
