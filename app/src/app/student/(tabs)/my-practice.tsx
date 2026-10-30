// The Practice tab (docs/DECISIONS.md #670, #676; Sarvesh Prji's student spec, sections 1-2), with the Śrī Khol as its
// icon (#671): Today's Practice first, then the practice tools (metronome, taal player and Record myself, S5), Weekly
// Practice from the teachers and My Practice Goal for this week (both shown with Start on S5), Practice History (S6)
// and one large Rhythm Playground card in place of the game tiles (#730): the tap pad, Which bol? (now Sound Detective)
// and Echo me are inside it, at the same addresses. Its address is /student/my-practice: /student/practice stays the
// practice tools, which the daily reminder and the What's new entries open (lib/practice-reminder.ts). A tab of the
// first web download, so it holds only cards; the tools load from the student area (#650). The Playground card shows only
// while the Playground is on for this student (#781).

import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-provider';
import { ListRow } from '@/components/list-row';
import { usePlaygroundOn } from '@/components/playground-only';
import { Screen } from '@/components/screen';
import { ShortcutTiles, type Shortcut } from '@/components/shortcut-tiles';
import { TodayPracticeCard } from '@/components/today-practice-card';
import { fetchPracticeDays, type PracticeDays } from '@/data/practice';
import { fetchTodayPlan, type TodayPlan } from '@/data/today-practice';
import { todayLocal } from '@/lib/dates';
import { useLatestLoad } from '@/lib/latest-load';
import { DEFAULT_GOAL, goalWeek } from '@/lib/practice-goal';
import { todayPractice } from '@/lib/today-practice';

/** The Practice tab. */
export default function StudentPracticeTab() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const myId = profile?.id ?? '';
  const [plan, setPlan] = useState<TodayPlan | null>(null);
  const [practice, setPractice] = useState<PracticeDays | null>(null);
  const beginLoad = useLatestLoad();
  const playgroundOn = usePlaygroundOn();

  const load = useCallback(async () => {
    const isNewest = beginLoad();
    const loadedPlan = myId ? await fetchTodayPlan(myId) : null;
    if (!isNewest() || !loadedPlan) return;
    setPlan(loadedPlan);
    const loadedDays = await fetchPracticeDays(loadedPlan.studentId);
    if (isNewest()) setPractice(loadedDays);
  }, [myId, beginLoad]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const today = todayLocal();
  const goal = practice?.goal ?? DEFAULT_GOAL;
  const card = plan
    ? todayPractice({ ...plan, goal, days: practice?.days ?? [], nextTitle: null, today })
    : null;
  const week = practice ? goalWeek(practice.days, goal, today) : null;
  const items = plan?.items.length ?? 0;
  const toTools = () => router.push('/student/practice');

  const playground: Shortcut[] = [
    {
      key: 'playground',
      icon: 'drum',
      tone: 'indigo',
      label: t('playground.title'),
      detail: t('playground.entryDetail'),
      onPress: () => router.push('/student/playground'),
    },
  ];

  return (
    <Screen underHeader onRefresh={load}>
      <TodayPracticeCard today={card} />
      <ListRow leading="practice" title={t('practiceTab.tools')} details={[t('practiceTab.toolsDetail')]} onPress={toTools} />
      <ListRow
        leading="todo"
        title={t('practice.planTitle')}
        details={plan ? [items > 0 ? t('practiceTab.weeklyItems', { count: items }) : t('practiceTab.weeklyNone')] : []}
        onPress={toTools}
      />
      <ListRow
        leading="score"
        title={t('practice.goalTitle')}
        details={week ? [t('practice.goalDays', { met: week.met, goal: goal.days })] : []}
        highlight={week?.goalMet ? 'confirmed' : undefined}
        onPress={toTools}
      />
      <ListRow leading="time" title={t('practiceLog.title')} onPress={() => router.push('/student/practice-log')} />
      {playgroundOn ? <ShortcutTiles wide shortcuts={playground} /> : null}
    </Screen>
  );
}
