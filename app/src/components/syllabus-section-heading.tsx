// The heading over one section of a level's syllabus (docs/DECISIONS.md #773): the team's own words, e.g.
// "Section 1: Core Practice – Hand Practice, Mantras, Tāla, Mātrās", or "Other lessons" for items without a section in
// a level that has sections. Used by My progress (S4) and the Guru's level page (G4); grouping in
// lib/syllabus-sections.ts.

import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { spacing, useTheme } from '@/theme/use-theme';

/** A section heading; `section` null = the items without a section. */
export function SyllabusSectionHeading({ section }: { section: string | null }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View accessibilityRole="header" style={[styles.heading, { borderBottomColor: colors.accent }]}>
      <AppText variant="label" tone="primary">
        {section ?? t('syllabus.noSection')}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  heading: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    borderBottomWidth: 1,
  },
});
