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

const toneStyles = {
  accent: {
    pillBackground: '#D8ECFF',
    pillText: '#0C4A7D',
  },
  success: {
    pillBackground: '#DDF7E8',
    pillText: '#155B3A',
  },
  warning: {
    pillBackground: '#FFF1D6',
    pillText: '#7D4C0C',
  },
  neutral: {
    pillBackground: '#ECE9E2',
    pillText: '#4C4A45',
  },
} as const;

export default function HomeScreen() {
  return (
    <ThemedView style={styles.root}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          contentInset={{ bottom: BottomTabInset }}>
          <ThemedView style={styles.heroCard}>
            <View style={styles.heroGlowLarge} />
            <View style={styles.heroGlowSmall} />

            <ThemedText type="smallBold" style={styles.kicker}>
              React Native 工作台
            </ThemedText>
            <ThemedText type="title" style={styles.heroTitle}>
              {dashboard.heroTitle}
            </ThemedText>
            <ThemedText style={styles.heroSummary} themeColor="textSecondary">
              {dashboard.heroSummary}
            </ThemedText>

            <View style={styles.statusStrip}>
              <View style={styles.statusDot} />
              <ThemedText type="small" style={styles.statusText}>
                {dashboard.syncStatus}
              </ThemedText>
            </View>
          </ThemedView>

          <View style={styles.statsGrid}>
            {dashboard.stats.map(stat => {
              const tone = toneStyles[stat.tone];
              return (
                <ThemedView key={stat.label} type="backgroundElement" style={styles.statCard}>
                  <View style={[styles.pill, { backgroundColor: tone.pillBackground }]}>
                    <ThemedText type="smallBold" style={{ color: tone.pillText }}>
                      {stat.label}
                    </ThemedText>
                  </View>
                  <ThemedText type="subtitle" style={styles.statValue}>
                    {stat.value}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {stat.detail}
                  </ThemedText>
                </ThemedView>
              );
            })}
          </View>

          <ThemedView type="backgroundElement" style={styles.sectionCard}>
            <ThemedText type="subtitle" style={styles.sectionTitle}>
              今天先推进什么
            </ThemedText>
            <View style={styles.rowGap}>
              {dashboard.actions.map(action => (
                <View key={action.title} style={styles.timelineRow}>
                  <View style={styles.timelineRail}>
                    <View style={styles.timelinePoint} />
                  </View>
                  <View style={styles.timelineContent}>
                    <View style={styles.actionHeader}>
                      <ThemedText type="smallBold">{action.title}</ThemedText>
                      <View style={styles.actionBadge}>
                        <ThemedText type="smallBold" style={styles.actionBadgeText}>
                          {action.badge}
                        </ThemedText>
                      </View>
                    </View>
                    <ThemedText type="small" themeColor="textSecondary">
                      {action.detail}
                    </ThemedText>
                  </View>
                </View>
              ))}
            </View>
          </ThemedView>

          <ThemedView type="backgroundElement" style={styles.sectionCard}>
            <ThemedText type="subtitle" style={styles.sectionTitle}>
              当前 Code Review 焦点
            </ThemedText>
            <View style={styles.rowGap}>
              {dashboard.reviewFocus.map(item => (
                <View key={item.title} style={styles.focusCard}>
                  <View
                    style={[
                      styles.severityBar,
                      item.severity === 'high' ? styles.severityHigh : styles.severityMedium,
                    ]}
                  />
                  <View style={styles.focusContent}>
                    <ThemedText type="smallBold">{item.title}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {item.detail}
                    </ThemedText>
                  </View>
                </View>
              ))}
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
    paddingTop: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.three,
  },
  heroCard: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#F5F0E8',
    borderRadius: 32,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  heroGlowLarge: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: '#B7DCF6',
    top: -96,
    right: -70,
    opacity: 0.65,
  },
  heroGlowSmall: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 999,
    backgroundColor: '#F5C7A9',
    bottom: -36,
    right: 16,
    opacity: 0.45,
  },
  kicker: {
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: '#4C4A45',
  },
  heroTitle: {
    fontSize: 42,
    lineHeight: 46,
    color: '#201C17',
  },
  heroSummary: {
    maxWidth: 520,
  },
  statusStrip: {
    marginTop: Spacing.two,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.58)',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: '#D16B29',
  },
  statusText: {
    color: '#3E3A35',
  },
  statsGrid: {
    gap: Spacing.three,
  },
  statCard: {
    borderRadius: 28,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  pill: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: 999,
  },
  statValue: {
    fontSize: 28,
    lineHeight: 34,
  },
  sectionCard: {
    borderRadius: 28,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  sectionTitle: {
    fontSize: 26,
    lineHeight: 32,
  },
  rowGap: {
    gap: Spacing.three,
  },
  timelineRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  timelineRail: {
    width: 24,
    alignItems: 'center',
  },
  timelinePoint: {
    width: 14,
    height: 14,
    borderRadius: 999,
    marginTop: 6,
    backgroundColor: '#208AEF',
  },
  timelineContent: {
    flex: 1,
    gap: Spacing.one,
  },
  actionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
  },
  actionBadge: {
    backgroundColor: '#D8ECFF',
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  actionBadgeText: {
    color: '#0C4A7D',
  },
  focusCard: {
    flexDirection: 'row',
    overflow: 'hidden',
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  severityBar: {
    width: 8,
  },
  severityHigh: {
    backgroundColor: '#D16B29',
  },
  severityMedium: {
    backgroundColor: '#208AEF',
  },
  focusContent: {
    flex: 1,
    padding: Spacing.three,
    gap: Spacing.one,
  },
});
