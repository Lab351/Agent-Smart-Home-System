import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ScreenShell } from '@/features/shared/screen-shell';
import { SectionCard } from '@/features/shared/section-card';

type BeaconPreview = {
  roomName: string;
  rssi: number;
  distance: number | null;
};

type RoomBindingScreenProps = {
  currentRoomName: string | null;
  scanning: boolean;
  discoveredBeacons: BeaconPreview[];
  onToggleScan?: () => void;
  onUnbind?: () => void;
};

export function RoomBindingScreen({
  currentRoomName,
  scanning,
  discoveredBeacons,
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
        </View>

        <View style={styles.buttonRow}>
          <Pressable onPress={onToggleScan} style={styles.primaryButton}>
            <ThemedText style={styles.primaryButtonText}>
              {scanning ? '停止扫描' : '开始扫描'}
            </ThemedText>
          </Pressable>
          <Pressable onPress={onUnbind} style={styles.secondaryButton}>
            <ThemedText style={styles.secondaryButtonText}>解绑房间</ThemedText>
          </Pressable>
        </View>
      </SectionCard>

      <SectionCard title="附近 Beacon" description="首版先保留扫描结果展示与房间决策所需的信号信息。">
        <View style={styles.beaconList}>
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
  beaconList: {
    gap: 10,
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
});
