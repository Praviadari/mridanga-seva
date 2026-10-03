// The beat-name grid of the taal player (S5): one row per vibhag, its mark at the start as the
// kksongs khol course writes it (X sam, 2 / 3 tali = an open baya stroke, 0 khali), then the beats
// with their number and bols ('te.re' shown "te re"; '–' a rest). The beat being heard is lit.

import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { radius, spacing, useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';

/** Props for BeatGrid. */
export type BeatGridProps = {
  bols: readonly string[];
  divisions: readonly number[];
  marks: readonly string[];
  /** Beat being heard (0-based), or null. */
  current: number | null;
};

/** The vibhags of a taal with their beats. */
export function BeatGrid({ bols, divisions, marks, current }: BeatGridProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const rows = divisions.map((size, index) => ({
    index,
    start: divisions.slice(0, index).reduce((sum, d) => sum + d, 0),
    size,
    mark: marks[index] ?? '',
  }));

  return (
    <View style={styles.grid}>
      {rows.map((row) => (
        <View key={row.index} style={styles.row}>
          <View style={styles.mark} accessibilityLabel={t('practice.markLabel', { mark: markName(t, row.mark) })}>
            <AppText variant="subtitle" tone="primary">
              {row.mark}
            </AppText>
          </View>
          <View style={styles.beats}>
            {bols.slice(row.start, row.start + row.size).map((bol, i) => {
              const beat = row.start + i;
              const on = beat === current;
              return (
                <View
                  key={beat}
                  style={[
                    styles.cell,
                    { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary : colors.surface },
                  ]}>
                  <AppText variant="small" style={{ color: on ? colors.onPrimary : colors.textMuted }}>
                    {beat + 1}
                  </AppText>
                  <AppText variant="label" style={{ color: on ? colors.onPrimary : colors.text }}>
                    {bol === '-' ? '–' : bol.split('.').join(' ')}
                  </AppText>
                </View>
              );
            })}
          </View>
        </View>
      ))}
      <AppText variant="small" tone="muted">
        {t('practice.marksLegend')}
      </AppText>
    </View>
  );
}

/** The spoken name of a vibhag mark. */
function markName(t: (key: 'practice.sam' | 'practice.khali' | 'practice.tali', options?: { n: string }) => string, mark: string): string {
  if (mark === 'X') return t('practice.sam');
  if (mark === '0') return t('practice.khali');
  return t('practice.tali', { n: mark });
}

const styles = StyleSheet.create({
  grid: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  mark: {
    width: 28,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  beats: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  cell: {
    minWidth: 48,
    minHeight: 52,
    paddingHorizontal: spacing.xs,
    borderWidth: 1.5,
    borderRadius: radius,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
