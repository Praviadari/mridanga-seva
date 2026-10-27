// The Daily Mission card, named Today's Practice in the spec (docs/DECISIONS.md #673; Sarvesh Prji's student spec,
// section 2; the English name since 27-10-2026), first on the student home and
// on the Practice tab: the Śrī Khol, what to practise (a taal of the Weekly Practice, a lesson, the next syllabus item
// or free practice), the guna and tempo, the minutes suggested, how far today is, and one big Start / Continue to the
// practice tools, which start the timer with the first sound (S5). Worked out in lib/today-practice.ts. Until it is
// loaded (or without internet) the card still shows Start.

import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import type { TodayPractice } from '@/lib/today-practice';
import { cardLook, spacing, useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';
import { Button } from './button';
import { IconBadge } from './icon';
import { ProgressBar } from './progress-bar';

/** Props for TodayPracticeCard. */
export type TodayPracticeCardProps = {
  /** null while loading. */
  today: TodayPractice | null;
};

/** The Today's Practice card. */
export function TodayPracticeCard({ today }: TodayPracticeCardProps) {
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
    </View>
  );
}

const styles = StyleSheet.create({
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
});
