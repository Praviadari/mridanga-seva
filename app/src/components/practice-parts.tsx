// Pieces of the practice screens shared by S5, S6, S4 My progress and C8 Student profile: practice
// time in words, the weekly practice (this week large, the weeks before as bars), and the Practice
// block that S4 (the student's own) and C8 (staff, any student) show.

import { router, useFocusEffect } from 'expo-router';
import type { TFunction } from 'i18next';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { fetchMyStudentId, fetchPracticeWeeks, type PracticeWeek } from '@/data/practice';
import { formatDayMonthYear } from '@/lib/dates';
import { radius, spacing, useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';
import { Button } from './button';
import { Section } from './section';

/** 135 → "2 h 15 min", 40 → "40 min". */
export function practiceTime(t: TFunction, minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? t('practice.hoursMinutes', { h, m }) : t('practice.minutes', { m });
}

/** Props for WeeklyPractice. */
export type WeeklyPracticeProps = {
  /** Newest week first (practice_weeks). */
  weeks: readonly PracticeWeek[];
};

/** This week's practice large, then one bar per earlier week. */
export function WeeklyPractice({ weeks }: WeeklyPracticeProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  if (weeks.length === 0) return null;
  const [thisWeek, ...earlier] = weeks;
  const most = Math.max(1, ...weeks.map((w) => w.minutes));
  return (
    <View style={styles.wrap}>
      <View>
        <AppText variant="title">{practiceTime(t, thisWeek.minutes)}</AppText>
        <AppText tone="muted">{t('practice.thisWeek', { date: formatDayMonthYear(thisWeek.weekStart) })}</AppText>
      </View>
      {earlier.map((week) => (
        <View
          key={week.weekStart}
          style={styles.row}
          accessible
          accessibilityLabel={`${t('practice.weekOf', { date: formatDayMonthYear(week.weekStart) })}: ${practiceTime(t, week.minutes)}`}>
          <AppText variant="small" tone="muted" style={styles.label}>
            {t('practice.weekOf', { date: formatDayMonthYear(week.weekStart) })}
          </AppText>
          <View style={[styles.track, { backgroundColor: colors.skeleton }]}>
            <View style={[styles.bar, { width: `${(week.minutes / most) * 100}%`, backgroundColor: colors.primary }]} />
          </View>
          <AppText variant="small" style={styles.value}>
            {practiceTime(t, week.minutes)}
          </AppText>
        </View>
      ))}
    </View>
  );
}

/** Props for PracticePanel: a student record (C8), or the signed-in student's login (S4). */
export type PracticePanelProps = { studentId: string } | { profileId: string };

/** How many weeks the panel shows. */
const PANEL_WEEKS = 4;

/**
 * The Practice block: weekly practice of the last 4 weeks. On S4 it also opens the student's log
 * (S6). Loads by itself each time the screen comes into view, like PromotionPanel on C8.
 */
export function PracticePanel(props: PracticePanelProps) {
  const { t } = useTranslation();
  const own = 'profileId' in props;
  const key = own ? props.profileId : props.studentId;
  // undefined = loading, null = could not load, 'none' = no student record for this login.
  const [weeks, setWeeks] = useState<PracticeWeek[] | 'none' | null | undefined>(undefined);

  const load = useCallback(async () => {
    const studentId = own ? await fetchMyStudentId(key) : key;
    if (studentId === null || studentId === 'not_found') {
      setWeeks(studentId === null ? null : 'none');
      return;
    }
    setWeeks(await fetchPracticeWeeks(studentId, PANEL_WEEKS));
  }, [own, key]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (weeks === 'none') return null;
  return (
    <Section icon="practice" title={t('practice.panelTitle')} description={own ? t('practice.panelIntroOwn') : t('practice.panelIntroStaff')}>
      {weeks === undefined ? <AppText tone="muted">{t('practice.loading')}</AppText> : null}
      {weeks === null ? <AppText tone="muted">{t('practiceLog.loadFailed')}</AppText> : null}
      {weeks ? <WeeklyPractice weeks={weeks} /> : null}
      {own ? (
        <Button variant="link" icon="time" label={t('practiceLog.open')} onPress={() => router.push('/student/practice-log')} />
      ) : null}
    </Section>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  label: {
    width: 120,
  },
  track: {
    flex: 1,
    height: 10,
    borderRadius: radius,
    overflow: 'hidden',
  },
  bar: {
    height: 10,
  },
  value: {
    width: 84,
    textAlign: 'right',
  },
});
