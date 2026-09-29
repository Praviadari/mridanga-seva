// A titled card that groups related fields in a long form, e.g. "Student" and "Parent or guardian".

import type { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';

import { radius, spacing, useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';

/** Props for Section. */
export type SectionProps = PropsWithChildren<{
  /** Heading, already translated. */
  title: string;
  /** One line under the heading explaining the section, already translated. */
  description?: string;
}>;

/** Card with a heading and the fields inside it. */
export function Section({ title, description, children }: SectionProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <AppText variant="subtitle">{title}</AppText>
      {description ? <AppText tone="muted">{description}</AppText> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: radius,
    padding: spacing.md,
    gap: spacing.md,
  },
});
