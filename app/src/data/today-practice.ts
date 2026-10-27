// What Today's Practice reads (docs/DECISIONS.md #673; lib/today-practice.ts works it out): the student's level's
// Weekly Practice with its lesson titles (fetchMyPracticePlan) and the taals' names (fetchTaals, the copy on the phone
// without internet). Read-only, no new database function.

import { todayLocal } from '@/lib/dates';
import { DEFAULT_GOAL } from '@/lib/practice-goal';
import { todayPractice, type TodayPractice } from '@/lib/today-practice';

import { fetchMyPracticePlan, fetchPracticeDays, fetchTaals, type PlanItem } from './practice';

/** The plan part of Today's Practice. */
export type TodayPlan = {
  studentId: string;
  items: PlanItem[];
  taalNames: Map<number, string>;
  lessonTitles: Map<number, string>;
};

/** The signed-in student's Weekly Practice with names. null = no student record or could not be loaded. */
export async function fetchTodayPlan(profileId: string): Promise<TodayPlan | null> {
  const [mine, taals] = await Promise.all([fetchMyPracticePlan(profileId), fetchTaals().catch(() => null)]);
  if (!mine || mine === 'not_found') return null;
  return {
    studentId: mine.studentId,
    items: mine.plan.items,
    taalNames: new Map((taals?.taals ?? []).map((taal) => [taal.id, taal.name])),
    lessonTitles: new Map([...mine.lessons.values()].map((lesson) => [lesson.id, lesson.title])),
  };
}

/**
 * Today's card for the signed-in student: the plan, then this year's days with the goal (practice_days), read each
 * time the screen comes into view so the minutes just practised show. `nextTitle`: the level path's next item.
 * Null when nothing could be read (the card then shows Start alone).
 */
export async function fetchTodayPractice(profileId: string, nextTitle: string | null): Promise<TodayPractice | null> {
  const plan = await fetchTodayPlan(profileId);
  if (!plan) return null;
  const practice = await fetchPracticeDays(plan.studentId);
  return todayPractice({
    items: plan.items,
    taalNames: plan.taalNames,
    lessonTitles: plan.lessonTitles,
    goal: practice?.goal ?? DEFAULT_GOAL,
    days: practice?.days ?? [],
    nextTitle,
    today: todayLocal(),
  });
}
