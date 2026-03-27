import type { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';

type SectionCardProps = PropsWithChildren<{
  title: string;
  description?: string;
}>;

export function SectionCard({ title, description, children }: SectionCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <ThemedText style={styles.title}>{title}</ThemedText>
        {description ? <ThemedText style={styles.description}>{description}</ThemedText> : null}
      </View>
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 18,
    gap: 14,
    backgroundColor: '#FFF9F0',
    borderRadius: 24,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: '#E7DAC8',
  },
  header: {
    gap: 6,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1B2E2B',
  },
  description: {
    color: '#667A76',
    lineHeight: 20,
  },
  content: {
    gap: 12,
  },
});
