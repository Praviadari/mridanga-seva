// The beat-name grid of the taal player (S5): one row per vibhag, its mark at the start as the
// kksongs khol course writes it (X sam, 2 / 3 tali = an open baya stroke, 0 khali), then the beats
// with their number and bols ('te.re' shown "te re"; '–' a rest). The beat being heard is lit. In the
// taal player each beat also says which hand plays it (L, R, L+R; #404). At layakari (#491) a beat holds 2-4 written
// beats, each a word ("tere dhā"), and their hands.

import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { beatHands, bolHands } from '@/lib/hands';
import { layaGroups, layaText, type Laya, type LayaGroup } from '@/lib/practice-pattern';
import { radius, spacing, useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';

/** Props for BeatGrid. */
export type BeatGridProps = {
  bols: readonly string[];
  divisions: readonly number[];
  marks: readonly string[];
  /** Beat being heard (0-based), or null. */
  current: number | null;
  /** Under each beat, which hand plays it: L, R or L+R (#404). */
  hands?: boolean;
  /** Layakari (#491): written beats in each beat; 1 = as written. */
  laya?: Laya;
};

/** The vibhags of a taal with their beats. */
export function BeatGrid({ bols, divisions, marks, current, hands = false, laya = 1 }: BeatGridProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const groups = laya > 1 ? layaGroups(bols, laya) : null;
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
          {/* accessible: the mark is read as sam / khali / tali, not as "X" or "0" (audit P2-05, #332). */}
          <View style={styles.mark} accessible accessibilityLabel={t('practice.markLabel', { mark: markName(t, row.mark) })}>
            <AppText variant="subtitle" family="sans" tone="primary">
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
                    { borderColor: on ? colors.primary : colors.controlBorder, backgroundColor: on ? colors.primary : colors.surface },
                  ]}>
                  <AppText variant="small" style={{ color: on ? colors.onPrimary : colors.textMuted }}>
                    {beat + 1}
                  </AppText>
                  <AppText variant="label" style={{ color: on ? colors.onPrimary : colors.text }}>
                    {groups ? layaText(groups[beat]) : bol === '-' ? '–' : bol.split('.').join(' ')}
                  </AppText>
                  {hands ? (
                    <AppText variant="small" style={{ color: on ? colors.onPrimary : colors.primary }}>
                      {(groups ? groupHands(t, groups[beat]) : handsOf(t, bol)) || ' '}
                    </AppText>
                  ) : null}
                </View>
              );
            })}
          </View>
        </View>
      ))}
      <AppText variant="small" tone="muted">
        {t('practice.marksLegend')}
      </AppText>
      {hands ? (
        <AppText variant="small" tone="muted">
          {t('practice.handsLegend')}
        </AppText>
      ) : null}
    </View>
  );
}

/**
 * The hands of one beat (#404), a word for each bol: L (left hand, baya), R (right hand, dayan), L+R (both), ? (a bol
 * the app does not know); nothing for a rest. From lib/bols.ts through lib/hands.ts.
 */
function handsOf(t: TFunction, beat: string): string {
  const word = { left: t('practice.handLeftShort'), right: t('practice.handRightShort'), both: t('practice.handBothShort'), unknown: '?' };
  return beatHands(beat)
    .map((hands) => word[hands])
    .join(' ');
}

/** The hands of a beat at layakari (#491): each written beat's hands run together with "·", the written beats apart. */
function groupHands(t: TFunction, groups: readonly LayaGroup[]): string {
  const word = { left: t('practice.handLeftShort'), right: t('practice.handRightShort'), both: t('practice.handBothShort'), unknown: '?' };
  return groups
    .map((g) => g.bols.filter((b) => b.text !== '-').map((b) => word[bolHands(b)]).join('·'))
    .filter((w) => w !== '')
    .join(' ');
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
