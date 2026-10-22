// The weekly practice goal (docs/DECISIONS.md #400): a day counts when it has the minutes a day, and a week meets the
// goal with its days a week: 4 x 15 unless the student set their own (practice_goals) or the teachers set one for the
// level (practice_plans, migration 0052). What
// the student keeps up is the weeks in a row with the goal met, like the visits' weeks in a row (#382): a missed day is
// not a broken run, and this week counts once its goal is met, without breaking the run before it ends. Weeks start on
// Monday, days are the class's (practice_days answers per day at the class).

import { addDays } from './dates';
import { mondayOf } from './streak';

/** Minutes practised on one day, 'YYYY-MM-DD'. */
export type PracticeDay = { on: string; minutes: number };

/** Days a week, minutes a day. */
export type PracticeGoal = { days: number; minutes: number };

/** The goal without the student's own or a level plan row (as practice_days answers; Praveen 21-10-2026). */
export const DEFAULT_GOAL: PracticeGoal = { days: 4, minutes: 15 };

/** The minutes a day a student may pick for their own goal (the database takes 5-120). */
export const GOAL_MINUTE_CHOICES = [10, 15, 20, 30, 45, 60] as const;

/** One day of this week: met = the minutes a day reached; some = practice, less; none; later = still to come. */
export type GoalDay = { on: string; minutes: number; state: 'met' | 'some' | 'none' | 'later' };

/** This week against the goal. */
export type GoalWeek = {
  /** Monday to Sunday. */
  days: GoalDay[];
  /** Days with the minutes a day. */
  met: number;
  goalMet: boolean;
  /** Weeks in a row with the goal met, this week included once met. */
  weeksInARow: number;
};

/** Minutes per day, repeated days added up. */
function minutesByDay(days: readonly PracticeDay[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const d of days) out.set(d.on, (out.get(d.on) ?? 0) + d.minutes);
  return out;
}

/** Days of the week starting `monday` with at least the minutes a day. */
function daysMet(byDay: Map<string, number>, monday: string, goal: PracticeGoal): number {
  let n = 0;
  for (let i = 0; i < 7; i++) if ((byDay.get(addDays(monday, i)) ?? 0) >= goal.minutes) n++;
  return n;
}

/**
 * Weeks in a row with the goal met, counted back from this week, or from last week while this week's goal is not
 * met yet (a run is not broken before its week ends).
 */
export function goalWeeksInARow(days: readonly PracticeDay[], goal: PracticeGoal, today: string): number {
  const byDay = minutesByDay(days);
  let week = mondayOf(today);
  if (daysMet(byDay, week, goal) < goal.days) week = addDays(week, -7);
  let count = 0;
  // A year at most: practice_days answers 53 weeks at most.
  while (count < 53 && daysMet(byDay, week, goal) >= goal.days) {
    count++;
    week = addDays(week, -7);
  }
  return count;
}

/** This week, Monday to Sunday, against the goal. */
export function goalWeek(days: readonly PracticeDay[], goal: PracticeGoal, today: string): GoalWeek {
  const byDay = minutesByDay(days);
  const monday = mondayOf(today);
  const week: GoalDay[] = Array.from({ length: 7 }, (_, i) => {
    const on = addDays(monday, i);
    const minutes = byDay.get(on) ?? 0;
    const state = minutes >= goal.minutes ? 'met' : minutes > 0 ? 'some' : on > today ? 'later' : 'none';
    return { on, minutes, state };
  });
  const met = week.filter((d) => d.state === 'met').length;
  return { days: week, met, goalMet: met >= goal.days, weeksInARow: goalWeeksInARow(days, goal, today) };
}

/**
 * The staff list's guess that a week met the goal (#495): the goal's days with practice and, in all, its minutes. The list
 * knows the week's days and minutes, not the minutes of each day, so a day under the minutes a day may count.
 */
export function weekGoalMet(week: { days: number; minutes: number; goal: PracticeGoal }): boolean {
  return week.days >= week.goal.days && week.minutes >= week.goal.days * week.goal.minutes;
}
