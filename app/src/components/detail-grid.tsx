// A compact grid of "label over value" cells, two to a row, for the facts about a person on a
// profile (C8): joined, date of birth, phone, email, area, mentor, app login. Reads faster than
// seven "Label: value" sentences under each other. One column when the phone's text is large.

import { StyleSheet, View } from 'react-native';

import { spacing, useLargeText, useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';

/** One cell: the label and its value, both already translated or formatted. */
export type Detail = { label: string; value: string };

/** Props for DetailGrid. */
export type DetailGridProps = {
  details: readonly Detail[];
};

/** Labelled values in two columns (one with large text). Each cell is one item for screen readers. */
export function DetailGrid({ details }: DetailGridProps) {
  const { colors } = useTheme();
  const oneColumn = useLargeText();
  return (
    <View style={styles.grid}>
      {details.map((d) => (
        <View
          key={d.label}
          accessible
          accessibilityLabel={`${d.label}: ${d.value}`}
          style={[styles.cell, { flexBasis: oneColumn ? '100%' : '45%', borderTopColor: colors.cardBorder }]}>
          <AppText variant="small" tone="muted">
            {d.label}
          </AppText>
          <AppText>{d.value}</AppText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: spacing.md,
  },
  cell: {
    flexGrow: 1,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    gap: 2,
  },
});
