import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ScreenShell } from '@/features/shared/screen-shell';
import { SectionCard } from '@/features/shared/section-card';

type PreferenceSnapshot = {
  defaultRoom: string;
  bedtime: string;
  brightness: number;
  preferredTemp: number;
  climateMode: string;
};

type PreferencesScreenProps = {
  preferences: PreferenceSnapshot;
  habits: string[];
};

export function PreferencesScreen({ preferences, habits }: PreferencesScreenProps) {
  return (
    <ScreenShell
      eyebrow="Preferences"
      title="偏好设置"
      subtitle="用户习惯、默认房间和环境偏好会继续沿用快应用的个人配置模型。">
      <SectionCard title="基础偏好">
        <PreferenceRow label="默认房间" value={preferences.defaultRoom} />
        <PreferenceRow label="睡眠时间" value={preferences.bedtime} />
        <PreferenceRow label="默认亮度" value={`${preferences.brightness}%`} />
        <PreferenceRow label="默认温度" value={`${preferences.preferredTemp}°C`} />
        <PreferenceRow label="空调模式" value={preferences.climateMode} />
      </SectionCard>

      <SectionCard title="我的习惯" description="后续会把对话中提取到的习惯持久化到本地存储。">
        <View style={styles.habitList}>
          {habits.map(habit => (
            <View key={habit} style={styles.habitItem}>
              <ThemedText style={styles.habitText}>{habit}</ThemedText>
            </View>
          ))}
        </View>
      </SectionCard>
    </ScreenShell>
  );
}

function PreferenceRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.preferenceRow}>
      <ThemedText style={styles.preferenceLabel}>{label}</ThemedText>
      <ThemedText style={styles.preferenceValue}>{value}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  preferenceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E8D9C5',
  },
  preferenceLabel: {
    color: '#677874',
    fontWeight: '600',
  },
  preferenceValue: {
    color: '#1B2E2B',
    fontWeight: '700',
  },
  habitList: {
    gap: 10,
  },
  habitItem: {
    padding: 14,
    backgroundColor: '#F6EFE5',
    borderRadius: 18,
    borderCurve: 'continuous',
  },
  habitText: {
    color: '#29403C',
    lineHeight: 20,
  },
});
