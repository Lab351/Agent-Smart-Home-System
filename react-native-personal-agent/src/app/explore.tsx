import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { appEnv } from '@/config/env';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { buildDashboardModel } from '@/features/dashboard/dashboard-data';

const dashboard = buildDashboardModel({
  backendUrl: appEnv.backendUrl,
  mqttHost: appEnv.mqttHost,
  mqttWsPort: appEnv.mqttWsPort,
  roomCount: Object.keys(appEnv.roomDisplayNames).length,
  platform: 'android / ios / web',
});

const statusColors = {
  done: '#155B3A',
  active: '#0C4A7D',
  pending: '#4C4A45',
  blocked: '#7D4C0C',
} as const;

const statusBackgrounds = {
  done: '#DDF7E8',
  active: '#D8ECFF',
  pending: '#ECE9E2',
  blocked: '#FFF1D6',
} as const;

export default function ProgressScreen() {
  return (
    <ThemedView style={styles.root}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <ThemedView style={styles.headerCard}>
            <ThemedText type="smallBold" style={styles.headerKicker}>
              开发推进
            </ThemedText>
            <ThemedText type="subtitle" style={styles.headerTitle}>
              今日计划与验证路径
            </ThemedText>
            <ThemedText themeColor="textSecondary">
              这里承接 Code Review 之后的执行顺序，优先做能直接缩短联调路径的工作。
            </ThemedText>
          </ThemedView>

          <ThemedView type="backgroundElement" style={styles.panel}>
            <ThemedText type="subtitle" style={styles.panelTitle}>
              今日开发计划
            </ThemedText>
            <View style={styles.list}>
              {dashboard.todayPlan.map(item => (
                <View key={item.label} style={styles.planRow}>
                  <View
                    style={[
                      styles.badge,
                      { backgroundColor: statusBackgrounds[item.status] },
                    ]}>
                    <ThemedText
                      type="smallBold"
                      style={{ color: statusColors[item.status], textTransform: 'uppercase' }}>
                      {item.status}
                    </ThemedText>
                  </View>
                  <View style={styles.planContent}>
                    <ThemedText type="smallBold">{item.label}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {item.detail}
                    </ThemedText>
                  </View>
                </View>
              ))}
            </View>
          </ThemedView>

          <ThemedView type="backgroundElement" style={styles.panel}>
            <ThemedText type="subtitle" style={styles.panelTitle}>
              测试与验证
            </ThemedText>
            <View style={styles.list}>
              {dashboard.testStatus.map(item => (
                <View key={item.label} style={styles.testRow}>
                  <ThemedText type="smallBold">{item.label}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {item.detail}
                  </ThemedText>
                </View>
              ))}
            </View>
          </ThemedView>

          <ThemedView type="backgroundElement" style={styles.panel}>
            <ThemedText type="subtitle" style={styles.panelTitle}>
              迁移边界
            </ThemedText>
            <View style={styles.list}>
              <View style={styles.testRow}>
                <ThemedText type="smallBold">已迁移</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  环境配置、BLE 解析、录音封装、存储封装、基础路由与控制台 UI。
                </ThemedText>
              </View>
              <View style={styles.testRow}>
                <ThemedText type="smallBold">待迁移</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  DiscoveryService、ControlService、语音识别链路、偏好编辑流和设备状态回流。
                </ThemedText>
              </View>
              <View style={styles.testRow}>
                <ThemedText type="smallBold">当前环境限制</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  无法拉取线上 main；BLE 与录音只可做单元测试和静态校验，不能替代真机验证。
                </ThemedText>
              </View>
            </View>
          </ThemedView>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  safeArea: {
    flex: 1,
    maxWidth: MaxContentWidth,
  },
  scrollContent: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.six,
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.three,
  },
  headerCard: {
    backgroundColor: '#E8F1E8',
    borderRadius: 28,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  headerKicker: {
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: '#155B3A',
  },
  headerTitle: {
    fontSize: 30,
    lineHeight: 36,
  },
  panel: {
    borderRadius: 28,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  panelTitle: {
    fontSize: 24,
    lineHeight: 30,
  },
  list: {
    gap: Spacing.three,
  },
  planRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'flex-start',
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    minWidth: 72,
    alignItems: 'center',
  },
  planContent: {
    flex: 1,
    gap: Spacing.one,
  },
  testRow: {
    gap: Spacing.one,
  },
});
