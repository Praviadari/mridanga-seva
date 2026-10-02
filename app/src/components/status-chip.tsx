// Small coloured labels for a student's status and level, so a list can be scanned at a glance:
// New (blue), Active (green), Irregular (amber), Inactive (grey), Paused (purple), Left (red),
// and the level in saffron (docs/DECISIONS.md #36, round 3). The colour only helps; the word is
// always there, so nobody needs to tell colours apart.

import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import type { StudentStatus } from '@/data/student-overview';
import { levelName, statusName } from '@/i18n/labels';
import type { ChipTone } from '@/theme/colors';
import { spacing, useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';

/** Which colour each status gets. */
const STATUS_TONE: Record<StudentStatus, ChipTone> = {
  new: 'info',
  active: 'success',
  irregular: 'warning',
  inactive: 'neutral',
  paused: 'paused',
  left: 'danger',
};

/** One label in its colours. `label` is already translated. */
export function Chip({ label, tone }: { label: string; tone: ChipTone }) {
  const { colors } = useTheme();
  const look = colors.chips[tone];
  return (
    <View style={[styles.chip, { backgroundColor: look.background }]}>
      <AppText variant="small" style={[styles.text, { color: look.text }]}>
        {label}
      </AppText>
    </View>
  );
}

/** Props for StudentChips. */
export type StudentChipsProps = {
  /** Shown first, in saffron. Left out when undefined. */
  levelId?: number;
  status?: StudentStatus;
};

/** The level and status of a student as a row of labels that wraps on a narrow screen. */
export function StudentChips({ levelId, status }: StudentChipsProps) {
  const { t } = useTranslation();
  return (
    <View style={styles.row}>
      {levelId !== undefined ? <Chip label={levelName(t, levelId)} tone="level" /> : null}
      {status ? <Chip label={statusName(t, status)} tone={STATUS_TONE[status]} /> : null}
    </View>
  );
}

/** The words of StudentChips, for a screen reader label that reads a whole row at once. */
export function studentChipsText(t: TFunction, { levelId, status }: StudentChipsProps): string[] {
  return [
    ...(levelId !== undefined ? [levelName(t, levelId)] : []),
    ...(status ? [statusName(t, status)] : []),
  ];
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  text: {
    fontWeight: '600',
  },
});
