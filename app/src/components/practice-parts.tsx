// Pieces of the practice screens shared by S5, S6, S4 My progress and C8 Student profile: practice
// time in words, the weekly practice (this week large, the weeks before as bars), this week against
// the weekly goal (#400), and the Practice block that S4 (the student's own) and C8 (staff, any
// student) show, with the milestones (#493) and how the last sessions went (#494, both from 0056).

import { router, useFocusEffect, usePathname } from 'expo-router';
import type { TFunction } from 'i18next';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import {
  fetchMyStudentId,
  fetchPracticeDays,
  fetchPracticeHistory,
  fetchPracticeWeeks,
  fetchRecentFeelings,
  type FeelingTally,
  type PracticeDays,
  type PracticeWeek,
} from '@/data/practice';
import { formatDate, todayLocal } from '@/lib/dates';
import { milestones, milestoneSummary, type Milestone, type MilestoneKind } from '@/lib/milestones';
import { ownAreaOf } from '@/lib/own-area';
import { goalWeek } from '@/lib/practice-goal';
import { radius, spacing, useLargeText, useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';
import { Button } from './button';
import { Icon, type IconName } from './icon';
import { FeelingCounts } from './practice-feeling';
import { ProgressBar } from './progress-bar';
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
  // At large text the week and the time share a line and the bar goes under them: three columns of fixed
  // width left the bar no room at 200 % (audit P3-13, docs/DECISIONS.md #333).
  const large = useLargeText();
  if (weeks.length === 0) return null;
  const [thisWeek, ...earlier] = weeks;
  const most = Math.max(1, ...weeks.map((w) => w.minutes));
  return (
    <View style={styles.wrap}>
      <View>
        <AppText variant="title" family="sans">{practiceTime(t, thisWeek.minutes)}</AppText>
        <AppText tone="muted">{t('practice.thisWeek', { date: formatDate(thisWeek.weekStart) })}</AppText>
      </View>
      {earlier.map((week) => {
        const track = (
          <View style={[styles.track, large && styles.trackLarge, { backgroundColor: colors.skeleton }]}>
            <View style={[styles.bar, { width: `${(week.minutes / most) * 100}%`, backgroundColor: colors.primary }]} />
          </View>
        );
        return (
          <View
            key={week.weekStart}
            style={large ? styles.rowLarge : styles.row}
            accessible
            accessibilityLabel={`${t('practice.weekOf', { date: formatDate(week.weekStart) })}: ${practiceTime(t, week.minutes)}`}>
            <AppText variant="small" tone="muted" style={large ? styles.labelLarge : styles.label}>
              {t('practice.weekOf', { date: formatDate(week.weekStart) })}
            </AppText>
            {large ? null : track}
            <AppText variant="small" style={large ? styles.valueLarge : styles.value}>
              {practiceTime(t, week.minutes)}
            </AppText>
            {large ? track : null}
          </View>
        );
      })}
    </View>
  );
}

/** Props for GoalWeekView. */
export type GoalWeekViewProps = { practice: PracticeDays };

/**
 * This week against the weekly goal (#400): "3 of 5 days this week", one circle a day from Monday (filled = the
 * minutes a day reached, a dot = some practice, faint = still to come), what is left or "goal met", and the weeks in
 * a row with the goal met. Kind wording: a missed day is never called a loss.
 */
export function GoalWeekView({ practice }: GoalWeekViewProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const today = todayLocal();
  const week = goalWeek(practice.days, practice.goal, today);
  const left = Math.max(0, practice.goal.days - week.met);
  return (
    <View style={styles.wrap}>
      <AppText variant="label">{t('practice.goalDays', { met: week.met, goal: practice.goal.days })}</AppText>
      <View style={styles.days}>
        {week.days.map((day, i) => {
          const name = t(`duty.weekdays.${(i + 1) % 7}` as 'duty.weekdays.1');
          const isToday = day.on === today;
          return (
            <View
              key={day.on}
              style={styles.day}
              accessible
              accessibilityLabel={`${name}: ${day.minutes > 0 ? practiceTime(t, day.minutes) : t('practice.goalNone')}${day.state === 'met' ? `, ${t('practice.goalDayMet')}` : ''}`}>
              <View
                style={[
                  styles.dayCircle,
                  { borderColor: day.state === 'later' ? colors.border : colors.primary },
                  day.state === 'met' && { backgroundColor: colors.primary },
                ]}>
                {day.state === 'met' ? <Icon name="tick" size={18} color={colors.onPrimary} /> : null}
                {day.state === 'some' ? <View style={[styles.someDot, { backgroundColor: colors.primary }]} /> : null}
              </View>
              <AppText variant="small" tone={isToday ? 'default' : 'muted'} style={isToday ? styles.today : null}>
                {name}
              </AppText>
            </View>
          );
        })}
      </View>
      <AppText tone="muted">
        {[
          week.goalMet ? t('practice.goalMet') : t('practice.goalToGo', { count: left }),
          t('practice.goalRule', { minutes: practice.goal.minutes }),
          t(practice.own ? 'practice.goalOwn' : 'practice.goalClass'),
        ].join(' ')}
      </AppText>
      {week.weeksInARow > 0 ? (
        <View style={styles.inARow}>
          <Icon name="promote" size={20} color={colors.primary} />
          <AppText variant="label">{t('practice.goalWeeks', { count: week.weeksInARow })}</AppText>
        </View>
      ) : null}
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
  // S4 of a student, or Me > My progress of a staff member's own record (0053, #319).
  const area = ownAreaOf(usePathname());
  const key = own ? props.profileId : props.studentId;
  // undefined = loading, null = could not load, 'none' = no student record for this login.
  const [weeks, setWeeks] = useState<PracticeWeek[] | 'none' | null | undefined>(undefined);
  // The weekly goal (0052); null until loaded or where 0052 has not run: the card is left out.
  const [days, setDays] = useState<PracticeDays | null>(null);
  // The milestones from the whole history and how the panel's weeks went (0056); null: left out.
  const [history, setHistory] = useState<PracticeDays | null>(null);
  const [feelings, setFeelings] = useState<FeelingTally | null>(null);

  const load = useCallback(async () => {
    const studentId = own ? await fetchMyStudentId(key) : key;
    if (studentId === null || studentId === 'not_found') {
      setWeeks(studentId === null ? null : 'none');
      return;
    }
    const [loadedWeeks, loadedDays, loadedHistory, loadedFeelings] = await Promise.all([
      fetchPracticeWeeks(studentId, PANEL_WEEKS),
      fetchPracticeDays(studentId),
      fetchPracticeHistory(studentId),
      fetchRecentFeelings(studentId, PANEL_WEEKS),
    ]);
    setWeeks(loadedWeeks);
    setDays(loadedDays);
    setHistory(loadedHistory);
    setFeelings(loadedFeelings);
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
      {weeks && days ? <GoalWeekView practice={days} /> : null}
      {weeks ? <WeeklyPractice weeks={weeks} /> : null}
      {weeks && feelings && feelings.hard + feelings.okay + feelings.good > 0 ? (
        <View style={styles.wrap}>
          <AppText variant="small" tone="muted">
            {t('practiceExtras.feelingsLately', { count: PANEL_WEEKS })}
          </AppText>
          <FeelingCounts {...feelings} />
        </View>
      ) : null}
      {weeks && history ? <MilestonesView items={milestones(history.days, history.goal, todayLocal())} own={own} /> : null}
      {own ? (
        <Button variant="link" icon="time" label={t('practiceLog.open')} onPress={() => router.push(area === 'me' ? '/staff/me/practice-log' : '/student/practice-log')} />
      ) : null}
    </Section>
  );
}

/** The icon of each kind of milestone. */
const KIND_ICON: Record<MilestoneKind, IconName> = { days: 'today', hours: 'time', weeks: 'promote', week: 'attended' };

/** Props for MilestonesView. */
export type MilestonesViewProps = {
  items: readonly Milestone[];
  /** The student's own (S4): "you"; staff (C8): about the student. */
  own: boolean;
};

/**
 * The milestones (#493): each one reached as a gold-ringed medal with its date, newest first, then the next two with
 * how far. Kind words only: nothing is lost, nothing compared.
 */
export function MilestonesView({ items, own }: MilestonesViewProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { reached, upcoming } = milestoneSummary(items);
  return (
    <View style={styles.group}>
      <AppText variant="label">{t('practiceExtras.milestonesTitle')}</AppText>
      <AppText variant="small" tone="muted">
        {t(own ? 'practiceExtras.milestonesIntroOwn' : 'practiceExtras.milestonesIntroStaff')}
      </AppText>
      {reached.length === 0 ? (
        <AppText tone="muted">{t(own ? 'practiceExtras.milestonesNoneOwn' : 'practiceExtras.milestonesNoneStaff')}</AppText>
      ) : (
        <View style={styles.medals}>
          {reached.map((m) => (
            <View
              key={m.id}
              style={styles.medal}
              accessible
              accessibilityLabel={t('practiceExtras.milestoneReached', { name: milestoneName(t, m), date: formatDate(m.reachedOn ?? '') })}>
              <View style={[styles.medalRing, { borderColor: colors.ornament, backgroundColor: colors.primarySoft }]}>
                <Icon name={m.id === 'first' ? 'practice' : KIND_ICON[m.kind]} size={26} color={colors.onPrimarySoft} />
              </View>
              <AppText variant="small" style={styles.medalText}>
                {milestoneName(t, m)}
              </AppText>
              <AppText variant="small" tone="muted" style={styles.medalText}>
                {formatDate(m.reachedOn ?? '')}
              </AppText>
            </View>
          ))}
        </View>
      )}
      {/* The bar's own label is spoken only: the name of the next milestone is written above it. */}
      {upcoming.map((m) => (
        <View key={m.id} style={styles.next}>
          <AppText variant="small" aria-hidden>
            {t('practiceExtras.milestoneNext', { name: milestoneName(t, m) })}
          </AppText>
          <ProgressBar
            done={m.kind === 'hours' ? m.have : Math.min(m.have, m.target)}
            total={m.kind === 'hours' ? m.target * 60 : m.target}
            label={t('practiceExtras.milestoneNext', { name: milestoneName(t, m) })}
            valueText={milestoneSoFar(t, m)}
            showComplete={false}
          />
        </View>
      ))}
    </View>
  );
}

/** "7 practice days", "10 hours of practice", "4 weeks in a row", "Every day of a week", "First practice". */
export function milestoneName(t: TFunction, m: Milestone): string {
  if (m.id === 'first') return t('practiceExtras.milestoneFirst');
  switch (m.kind) {
    case 'days':
      return t('practiceExtras.milestoneDays', { count: m.target });
    case 'hours':
      return t('practiceExtras.milestoneHours', { count: m.target });
    case 'weeks':
      return t('practiceExtras.milestoneWeeks', { count: m.target });
    case 'week':
    default:
      return t('practiceExtras.milestoneFullWeek');
  }
}

/** How far, in words: "4 of 7 days", "6 h 20 min of 10 hours", "2 of 4 weeks", "5 of 7 days in one week". */
function milestoneSoFar(t: TFunction, m: Milestone): string {
  switch (m.kind) {
    case 'hours':
      return t('practiceExtras.soFarHours', { time: practiceTime(t, m.have), count: m.target });
    case 'weeks':
      return t('practiceExtras.soFarWeeks', { n: m.have, count: m.target });
    case 'week':
      return t('practiceExtras.soFarWeek', { n: m.have });
    case 'days':
    default:
      return t('practiceExtras.soFarDays', { n: m.have, count: m.target });
  }
}

const styles = StyleSheet.create({
  group: {
    gap: spacing.sm,
  },
  next: {
    gap: spacing.xs,
  },
  medals: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  medal: {
    width: 96,
    alignItems: 'center',
    gap: spacing.xs,
  },
  medalRing: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medalText: {
    textAlign: 'center',
  },  wrap: {
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
  days: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  day: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
  },
  dayCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  someDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  today: {
    fontWeight: '700',
  },
  inARow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  // Large text: week and time on the first line, the bar across the whole width under them.
  rowLarge: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: spacing.sm,
    rowGap: spacing.xs,
  },
  labelLarge: {
    flexGrow: 1,
    flexShrink: 1,
  },
  valueLarge: {
    textAlign: 'right',
  },
  trackLarge: {
    flexBasis: '100%',
  },
});
