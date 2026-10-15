// Weeks in a row with at least one visit, for the student's My attendance (docs/DECISIONS.md #382): what the student
// keeps up, like a learning app's streak, in place of "days since your last visit". Counted back from this week, or
// from last week while this week has no visit yet (a run is not broken before its week ends). Weeks start on Monday.

import { addDays } from './dates';

/** The Monday of the week of an ISO day 'YYYY-MM-DD', as 'YYYY-MM-DD'. */
export function mondayOf(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, date)).getUTCDay(); // 0 = Sunday
  return addDays(day, -((weekday + 6) % 7));
}

/**
 * How many weeks in a row, up to this one, have a visit.
 * @param visitDays the days of the visits ('YYYY-MM-DD', any order, repeats allowed).
 * @param today today at the class ('YYYY-MM-DD').
 */
export function weeksInARow(visitDays: readonly string[], today: string): number {
  const weeks = new Set(visitDays.map(mondayOf));
  let week = mondayOf(today);
  if (!weeks.has(week)) week = addDays(week, -7);
  let count = 0;
  while (weeks.has(week)) {
    count++;
    week = addDays(week, -7);
  }
  return count;
}
