// The Daily Mission card, named Today's Practice in the spec (docs/DECISIONS.md #673; Sarvesh Prji's student spec,
// section 2; the English name since 27-10-2026), first on the student home and
// on the Practice tab: the Śrī Khol, what to practise (a taal of the Weekly Practice, a lesson, the next syllabus item
// or free practice), the guna and tempo, the minutes suggested, how far today is, and one big Start / Continue to the
// practice tools, which start the timer with the first sound (S5). Worked out in lib/today-practice.ts. Until it is
// loaded (or without internet) the card still shows Start.
//
// Under the khol line, the Daily Sādhana Quest (docs/RHYTHM_PLAYGROUND.md §7.10; docs/DECISIONS.md #754): 2-4 short
// Playground games for today, each a line "Listen · Missing Beat · 2 min" that opens the game with a ready round and
// is ticked when played. The khol stays first. Shown only for a student the Playground is on for (#781); its code is
// loaded when the card is shown (a separate download on the web, #650). A skipped day loses nothing and says nothing.

import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/auth-provider';
import type { TodayPractice } from '@/lib/today-practice';
import { studentAreaReady } from '@/lib/web-areas';
import type { QuestLineTo } from '@/screens/playground/daily-quest-load';
import { cardLook, spacing, useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';
import { Button } from './button';
import { Icon, IconBadge } from './icon';
import { usePlaygroundOn } from './playground-only';
import { ProgressBar } from './progress-bar';

/** Props for TodayPracticeCard. */
export type TodayPracticeCardProps = {
  /** null while loading. */
  today: TodayPractice | null;
  /** The ring home (preview 28-10-2026): one row, so the ring fits under it without scrolling. */
  slim?: boolean;
};

/** The Today's Practice card. */
export function TodayPracticeCard({ today, slim }: TodayPracticeCardProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const topic = today?.topic;
  const what =
    topic?.kind === 'taal'
      ? topic.name
      : topic?.kind === 'lesson' || topic?.kind === 'next'
        ? topic.title
        : t('todayPractice.free');
  const facts = [
    topic?.kind === 'taal' ? t('todayPractice.guna', { guna: t('practiceExtras.laya1') }) : null,
    topic?.kind === 'taal' ? t('todayPractice.tempo', { bpm: topic.bpm }) : null,
    today ? t('todayPractice.minutes', { count: today.minutes }) : null,
  ].filter((fact): fact is string => !!fact);
  const done = today ? Math.min(today.doneToday, today.minutes) : 0;
  const valueText = today ? t('todayPractice.progress', { done: today.doneToday, total: today.minutes }) : '';
  const start = today?.state === 'continue' ? t('todayPractice.continue') : today?.state === 'done' ? t('todayPractice.more') : t('todayPractice.start');

  if (slim) {
    // One row: the khol, the name, what to practise and today's minutes, and Start; a thin line for today's progress.
    const line = today ? valueText : '';
    return (
      <View style={[styles.slim, cardLook(colors), { borderTopWidth: 3, borderTopColor: colors.accent }]}>
        <View style={styles.top}>
          <IconBadge name="practice" size={40} tone="teal" solid />
          <View style={styles.words}>
            <AppText variant="small" tone="muted" numberOfLines={1}>
              {t('todayPractice.title')}
            </AppText>
            <AppText variant="label" numberOfLines={1}>
              {what}
            </AppText>
            {line ? (
              <AppText variant="small" tone="muted" numberOfLines={2}>
                {line}
              </AppText>
            ) : null}
          </View>
          <Button icon="play" label={start} accessibilityLabel={`${start}: ${what}`} onPress={() => router.push('/student/practice')} />
        </View>
        {today ? (
          <View style={[styles.track, { backgroundColor: colors.border }]} aria-hidden>
            <View style={[styles.fill, { backgroundColor: colors.accent, width: `${Math.round((100 * done) / today.minutes)}%` }]} />
          </View>
        ) : null}
      </View>
    );
  }
  return (
    <View style={[styles.card, cardLook(colors), { borderTopWidth: 3, borderTopColor: colors.accent }]}>
      <View style={styles.top}>
        <IconBadge name="practice" size={48} tone="teal" solid />
        <View style={styles.words}>
          <AppText variant="label" tone="muted">
            {t('todayPractice.title')}
          </AppText>
          <AppText variant="subtitle" numberOfLines={2}>
            {what}
          </AppText>
          {facts.length > 0 ? (
            <AppText variant="small" tone="muted">
              {facts.join(' · ')}
            </AppText>
          ) : null}
        </View>
      </View>
      {today ? <ProgressBar done={done} total={today.minutes} label={t('todayPractice.progressLabel')} valueText={valueText} /> : null}
      <Button size="large" icon="play" label={start} accessibilityLabel={`${start}: ${what}`} onPress={() => router.push('/student/practice')} />
      <DailyQuest />
    </View>
  );
}

/** Today's Playground lines, read when the card comes into view (so a game just played shows ticked). */
function useDailyQuest(): QuestLineTo[] | null {
  const { profile } = useAuth();
  const profileId = profile?.id ?? '';
  // Off for this student (#781): no quest, and its code is not even loaded.
  const on = usePlaygroundOn();
  const [lines, setLines] = useState<QuestLineTo[] | null>(null);
  useFocusEffect(
    useCallback(() => {
      let live = true;
      if (profile?.role !== 'student' || !on) return undefined;
      // On the web the quest's code needs the student screens' file first (#650).
      void studentAreaReady()
        .then(() => import('@/screens/playground/daily-quest-load'))
        .then((m) => m.loadDailyQuest(profileId))
        .then((next) => {
          if (live) setLines(next);
        })
        .catch(() => undefined);
      return () => {
        live = false;
      };
    }, [profileId, profile?.role, on]),
  );
  return on ? lines : null;
}

/** The quest's lines: "Today in the Playground", each game a button, ticked when done. */
function DailyQuest() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const lines = useDailyQuest();
  if (!lines || lines.length === 0) return null;
  return (
    <View style={[styles.quest, { borderTopColor: colors.border }]}>
      <AppText variant="label" tone="muted">
        {t('todayPractice.questTitle')}
      </AppText>
      {lines.map((line) => {
        const name = t(`playground.game.${line.game}.name`);
        const group = t(line.group === 'listening' ? 'todayPractice.questListen' : 'todayPractice.questRhythm');
        const said = t(line.done ? 'todayPractice.questDoneSaid' : 'todayPractice.questSaid', { group, name, minutes: line.minutes });
        return (
          <Pressable
            key={line.game}
            accessibilityRole="button"
            accessibilityLabel={said}
            onPress={() => router.push({ pathname: line.route, params: { mode: 'daily', len: String(line.len) } })}
            style={({ pressed }) => [styles.line, { borderColor: colors.border }, pressed ? styles.pressed : null]}
          >
            <Icon name={line.done ? 'tick' : 'play'} size={20} color={line.done ? colors.accent : colors.text} />
            <AppText style={styles.lineText}>
              {t('todayPractice.questLine', { group, name, minutes: line.minutes })}
            </AppText>
            {line.done ? (
              <AppText variant="small" tone="muted">
                {t('todayPractice.questDone')}
              </AppText>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}
const styles = StyleSheet.create({
  slim: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  track: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  fill: {
    height: 4,
  },
  card: {
    padding: spacing.md,
    gap: spacing.md,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  words: {
    flex: 1,
    gap: 2,
  },
  quest: {
    gap: spacing.xs,
    borderTopWidth: 1,
    paddingTop: spacing.sm,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 44,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderRadius: 8,
  },
  lineText: {
    flex: 1,
  },
  pressed: {
    opacity: 0.7,
  },
});
