// Practice milestones (docs/DECISIONS.md #493): small celebrations on My progress and on the staff Student profile,
// worked out from the student's whole practice history (practice_history, migration 0056). Only the student and staff
// see them: no points, no leaderboard, nothing compared between children. A milestone once reached stays reached
// (the history only grows; an entry deleted within its 14 days may take one back). Weeks start on Monday, days are
// the class's, as in lib/practice-goal.ts; the weeks in a row are counted with the student's goal of today.

import { addDays } from './dates';
import type { PracticeDay, PracticeGoal } from './practice-goal';
import { mondayOf } from './streak';

/** The milestones, in the order they are shown. */
export const MILESTONE_IDS = [
  'first', 'days7', 'hours10', 'weeks4', 'fullWeek', 'days30', 'hours25', 'weeks12', 'days100', 'hours50', 'hours100',
] as const;

export type MilestoneId = (typeof MILESTONE_IDS)[number];

/** What a milestone counts: practice days, hours, weeks in a row with the goal met, or days of one week. */
export type MilestoneKind = 'days' | 'hours' | 'weeks' | 'week';

/** One milestone: what it counts, the number to reach, how far the student is, and the day it was reached. */
export type Milestone = {
  id: MilestoneId;
  kind: MilestoneKind;
  /** Days, hours, weeks, or 7 days of one week. */
  target: number;
  /** How far: days, minutes (kind hours), the best run of weeks, the most days in one week. */
  have: number;
  /** 'YYYY-MM-DD' it was reached, or null. */
  reachedOn: string | null;
};

const DEFINITIONS: Record<MilestoneId, { kind: MilestoneKind; target: number }> = {
  first: { kind: 'days', target: 1 },
  days7: { kind: 'days', target: 7 },
  days30: { kind: 'days', target: 30 },
  days100: { kind: 'days', target: 100 },
  hours10: { kind: 'hours', target: 10 },
  hours25: { kind: 'hours', target: 25 },
  hours50: { kind: 'hours', target: 50 },
  hours100: { kind: 'hours', target: 100 },
  weeks4: { kind: 'weeks', target: 4 },
  weeks12: { kind: 'weeks', target: 12 },
  fullWeek: { kind: 'week', target: 7 },
};

/** The day each count (1, 2, …) of a running total was first reached, by `step` (e.g. 60 minutes = an hour). */
type Firsts = Map<number, string>;

/**
 * The milestones from the practice days (any order, a day may come twice) and the goal of today, up to `today`.
 * Days after today (a clock set wrong) are left out.
 */
export function milestones(days: readonly PracticeDay[], goal: PracticeGoal, today: string): Milestone[] {
  const byDay = new Map<string, number>();
  for (const d of days) {
    if (d.on > today || d.minutes <= 0) continue;
    byDay.set(d.on, (byDay.get(d.on) ?? 0) + d.minutes);
  }
  const ordered = [...byDay.keys()].sort();

  // Practice days and minutes, in day order: the day the n-th day / the n-th minute came.
  const dayFirsts: Firsts = new Map();
  let minutes = 0;
  const minuteDays: { on: string; total: number }[] = [];
  ordered.forEach((on, i) => {
    dayFirsts.set(i + 1, on);
    minutes += byDay.get(on) ?? 0;
    minuteDays.push({ on, total: minutes });
  });
  const minuteReached = (need: number) => minuteDays.find((d) => d.total >= need)?.on ?? null;

  // Weeks from the first practice to this one: the run of weeks with the goal met (this week counts once met and is
  // not a break before it ends), and the most days practised in one week.
  const weekFirsts: Firsts = new Map();
  let run = 0;
  let bestRun = 0;
  let mostDays = 0;
  let fullWeekOn: string | null = null;
  if (ordered.length > 0) {
    const thisWeek = mondayOf(today);
    for (let week = mondayOf(ordered[0]); week <= thisWeek; week = addDays(week, 7)) {
      let met = 0;
      let metOn: string | null = null;
      let practised = 0;
      for (let i = 0; i < 7; i++) {
        const on = addDays(week, i);
        const m = byDay.get(on) ?? 0;
        if (m > 0) practised++;
        if (m >= goal.minutes) {
          met++;
          if (met === goal.days) metOn = on;
        }
      }
      mostDays = Math.max(mostDays, practised);
      if (practised === 7 && fullWeekOn === null) fullWeekOn = addDays(week, 6);
      if (metOn) {
        run++;
        if (!weekFirsts.has(run)) weekFirsts.set(run, metOn);
        bestRun = Math.max(bestRun, run);
      } else if (week < thisWeek) {
        run = 0;
      }
    }
  }

  return MILESTONE_IDS.map((id) => {
    const { kind, target } = DEFINITIONS[id];
    switch (kind) {
      case 'days':
        return { id, kind, target, have: ordered.length, reachedOn: dayFirsts.get(target) ?? null };
      case 'hours':
        return { id, kind, target, have: minutes, reachedOn: minuteReached(target * 60) };
      case 'weeks':
        return { id, kind, target, have: bestRun, reachedOn: weekFirsts.get(target) ?? null };
      case 'week':
      default:
        return { id, kind, target, have: mostDays, reachedOn: fullWeekOn };
    }
  });
}

/** How far towards a milestone, 0-1. */
export function milestoneProgress(m: Milestone): number {
  const need = m.kind === 'hours' ? m.target * 60 : m.target;
  return m.reachedOn ? 1 : Math.min(1, Math.max(0, m.have / need));
}

/**
 * What the card shows: the milestones reached, newest first, and the next ones (`next` of them, the nearest first;
 * equal ones in the order of MILESTONE_IDS).
 */
export function milestoneSummary(all: readonly Milestone[], next = 2): { reached: Milestone[]; upcoming: Milestone[] } {
  const reached = all.filter((m) => m.reachedOn).sort((a, b) => (b.reachedOn ?? '').localeCompare(a.reachedOn ?? '') || MILESTONE_IDS.indexOf(a.id) - MILESTONE_IDS.indexOf(b.id));
  const upcoming = all
    .filter((m) => !m.reachedOn)
    .sort((a, b) => milestoneProgress(b) - milestoneProgress(a) || MILESTONE_IDS.indexOf(a.id) - MILESTONE_IDS.indexOf(b.id))
    .slice(0, next);
  return { reached, upcoming };
}
