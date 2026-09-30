// A bar that fills as a count grows, with the count written under it, e.g. "3 of 6 done" on the
// syllabus tick-off screen (C9). Screen readers hear the label and the count.

import { StyleSheet, View } from 'react-native';

import { spacing, useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';

/** Props for ProgressBar. */
export type ProgressBarProps = {
  /** How many are done; the bar is full when it reaches `total`. */
  done: number;
  total: number;
  /** What is being counted, already translated, e.g. "Syllabus progress". Read out first. */
  label: string;
  /** The count in words, already translated, e.g. "3 of 6 done". Shown under the bar. */
  valueText: string;
  /**
   * Turn green when full. Default true. False for a share of a whole, such as the students of
   * one level on the Guru dashboard (G1), where a full bar is not an achievement.
   */
  showComplete?: boolean;
};

/** Horizontal progress bar in the brand colour; green once everything is done (see `showComplete`). */
export function ProgressBar({ done, total, label, valueText, showComplete = true }: ProgressBarProps) {
  const { colors } = useTheme();
  const share = total > 0 ? Math.min(1, done / total) : 0;
  const complete = showComplete && total > 0 && done >= total;
  return (
    <View
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
      aria-valuetext={valueText}
      style={styles.wrapper}>
      <View style={[styles.track, { backgroundColor: colors.border }]}>
        <View
          style={[
            styles.fill,
            { width: `${share * 100}%`, backgroundColor: complete ? colors.success : colors.primary },
          ]}
        />
      </View>
      <AppText variant="small" tone={complete ? 'success' : 'muted'}>
        {valueText}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: spacing.xs,
  },
  track: {
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 5,
  },
});
