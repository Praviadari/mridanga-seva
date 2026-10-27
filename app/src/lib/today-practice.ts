// Today's Practice (docs/DECISIONS.md #673; Sarvesh Prji's student spec, section 2): the one thing the student home
// puts first. Worked out here from what the app already keeps, with no new table (no migration):
// - What: one item of the teachers' Weekly Practice for the student's level (practice_plans, #401), a different one
//   each day of the week in the plan's order; without a plan the next syllabus item of the level path (#620); else
//   free practice.
// - Guna: a taal of the plan starts at ekgun, one written beat a beat (the taal player's layakari 1, #491); the plan
//   keeps no guna of its own, so a lesson or free practice shows none.
// - Minutes: the minutes a day of the student's weekly goal (practice_goals, the level's plan or 4 x 15, #400).
// - Progress: minutes practised today against those minutes; Start before any, Continue while short, done after.

import type { PlanItem } from '@/data/practice';

import type { PracticeDay, PracticeGoal } from './practice-goal';

/** What today's card offers to practise. */
export type TodayTopic =
  | { kind: 'taal'; taalId: number; name: string; bpm: number }
  | { kind: 'lesson'; materialId: number; title: string }
  | { kind: 'next'; title: string }
  | { kind: 'free' };

/** Today's card. */
export type TodayPractice = {
  topic: TodayTopic;
  /** Written beats a beat (1 = ekgun) for a taal; null for anything else. */
  guna: 1 | null;
  /** Minutes suggested for today. */
  minutes: number;
  /** Minutes practised today so far. */
  doneToday: number;
  /** start: nothing yet today; continue: some, less than suggested; done: the minutes reached. */
  state: 'start' | 'continue' | 'done';
};

/** What todayPractice reads. Every part may be missing (not loaded, offline): the card still offers Start. */
export type TodayInput = {
  items: readonly PlanItem[];
  taalNames: ReadonlyMap<number, string>;
  lessonTitles: ReadonlyMap<number, string>;
  goal: PracticeGoal;
  days: readonly PracticeDay[];
  /** The level path's next item to learn, or null. */
  nextTitle: string | null;
  /** 'YYYY-MM-DD', the class's day. */
  today: string;
};

/** Days since 1970-01-05 (a Monday), so the item changes each day and repeats each week. */
function dayNumber(today: string): number {
  const ms = Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, Number(today.slice(8, 10)));
  return Math.floor((ms - Date.UTC(1970, 0, 5)) / 86_400_000);
}

/** The plan's items the student can open: taals still in the list, lessons they may watch. */
function usable(items: readonly PlanItem[], taalNames: ReadonlyMap<number, string>, lessonTitles: ReadonlyMap<number, string>): TodayTopic[] {
  return items.flatMap((item): TodayTopic[] => {
    if (item.kind === 'taal') {
      const name = taalNames.get(item.taalId);
      return name ? [{ kind: 'taal', taalId: item.taalId, name, bpm: item.bpm }] : [];
    }
    const title = lessonTitles.get(item.materialId);
    return title ? [{ kind: 'lesson', materialId: item.materialId, title }] : [];
  });
}

/** Today's Practice from the plan, the goal and the days practised. */
export function todayPractice(input: TodayInput): TodayPractice {
  const topics = usable(input.items, input.taalNames, input.lessonTitles);
  const n = dayNumber(input.today);
  const topic: TodayTopic =
    topics.length > 0 ? topics[((n % topics.length) + topics.length) % topics.length] : input.nextTitle ? { kind: 'next', title: input.nextTitle } : { kind: 'free' };
  const doneToday = input.days.filter((d) => d.on === input.today).reduce((sum, d) => sum + d.minutes, 0);
  const minutes = Math.max(1, input.goal.minutes);
  return {
    topic,
    guna: topic.kind === 'taal' ? 1 : null,
    minutes,
    doneToday,
    state: doneToday <= 0 ? 'start' : doneToday < minutes ? 'continue' : 'done',
  };
}
