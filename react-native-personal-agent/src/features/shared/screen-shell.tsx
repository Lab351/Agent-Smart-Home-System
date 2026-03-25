import type { PropsWithChildren, ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';

type ScreenShellProps = PropsWithChildren<{
  eyebrow: string;
  title: string;
  subtitle: string;
  footer?: ReactNode;
}>;

export function ScreenShell({
  eyebrow,
  title,
  subtitle,
  footer,
  children,
}: ScreenShellProps) {
  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic">
        <View style={styles.heroCard}>
          <ThemedText style={styles.eyebrow}>{eyebrow}</ThemedText>
          <ThemedText style={styles.title}>{title}</ThemedText>
          <ThemedText style={styles.subtitle}>{subtitle}</ThemedText>
        </View>

        <View style={styles.body}>{children}</View>
        {footer}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F4EFE7',
  },
  scrollView: {
    flex: 1,
    backgroundColor: '#F4EFE7',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
    gap: 18,
  },
  heroCard: {
    padding: 20,
    gap: 10,
    backgroundColor: '#1E3532',
    borderRadius: 28,
    borderCurve: 'continuous',
  },
  eyebrow: {
    color: '#C5DDD3',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  title: {
    color: '#FFF9F0',
    fontSize: 30,
    lineHeight: 34,
    fontWeight: '700',
  },
  subtitle: {
    color: '#D8E4DF',
    lineHeight: 22,
  },
  body: {
    gap: 14,
  },
});
