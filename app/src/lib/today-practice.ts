// Today's Practice, shown as the Daily Mission card (docs/DECISIONS.md #673; Sarvesh Prji's student spec, section 2):
// the one thing the student home puts first. Worked out here from what the app already keeps, with no new table (no migration):
// - What: one item of the teachers' Weekly Practice for the student's level (practice_plans, #401), a different one
//   each day of the week in the plan's order; without a plan the next syllabus item of the level path (#620); else
//   free practice.
// - Guna: a taal of the plan starts at ekgun, one written beat a beat (the taal player's layakari 1, #491); the plan
//   keeps no guna of its own, so a lesson or free practice shows none.
// - Minutes: the minutes a day of the student's weekly goal (practice_goals, the level's plan or 4 x 15, #400).
// - Progress: minutes practised today against those minutes; Start before any, Continue while short, done after.

import type { PlanItem } from '@/data/practice';

import { makeRng } from './playground/rng';
import type { GameId, ProgressLabel, SkillId } from './playground/types';
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

// ---------------------------------------------------------------- the Daily Sādhana Quest (#754)
// docs/RHYTHM_PLAYGROUND.md §7.10: 2-4 short Playground games under the khol line of the same card (the khol stays
// first). Chosen from the games the student can play now (an eligible pool): the weakest skill first (lowest label,
// then the longest unpractised; assigned games before all), then one of the other group (one listening, one rhythm),
// then the next weakest, never a skill twice in a row; never the same games as yesterday when others exist. Ties are
// broken by a generator seeded with student + date, so missions differ day to day. A line is ticked when a round of
// its game was played from the quest today. Nothing here is lost or counted against the student when a day is skipped.

/** The two Playground groups the quest balances. */
export type QuestGroup = 'listening' | 'rhythm';

/** A game the quest may offer, with what the student's progress says of its skill. */
export type QuestOption = {
  game: GameId;
  skill: SkillId;
  group: QuestGroup;
  /** The skill's label; null = never played. */
  label: ProgressLabel | null;
  /** When the skill was last practised (ISO), or null. */
  lastPractised: string | null;
  /** A facilitator assigned it (§8.5 rule 7: first). */
  assigned: boolean;
};

/** One line of the quest: a game, its minutes, the challenges its round holds, and whether it is done today. */
export type QuestLine = { game: GameId; skill: SkillId; group: QuestGroup; minutes: number; len: number; done: boolean };

/** Lines on the card (the facilitator's daily length, §7.10: 2-4). */
export const QUEST_MIN_LINES = 2;
export const QUEST_MAX_LINES = 4;

const LABEL_RANK: Record<ProgressLabel, number> = { exploring: 0, practising: 1, steady: 2, ready_for_review: 3 };

/** Weakest first: assigned, then never played, then the lower label, then the longest unpractised. */
function weaker(a: QuestOption, b: QuestOption): number {
  if (a.assigned !== b.assigned) return a.assigned ? -1 : 1;
  const ra = a.label === null ? -1 : LABEL_RANK[a.label];
  const rb = b.label === null ? -1 : LABEL_RANK[b.label];
  if (ra !== rb) return ra - rb;
  return (a.lastPractised ?? '').localeCompare(b.lastPractised ?? '');
}

/** The day's picks, before the "not yesterday's games" rule. */
function questPick(options: readonly QuestOption[], count: number, seed: number): QuestOption[] {
  const order = makeRng(seed).shuffle(options).sort(weaker);
  const out: QuestOption[] = [];
  const take = (o: QuestOption | undefined) => {
    if (o) out.push(o);
  };
  take(order[0]);
  if (out.length > 0) take(order.find((o) => o.group !== out[0].group));
  for (const o of order) {
    if (out.length >= count) break;
    if (out.some((x) => x.game === o.game) || out[out.length - 1]?.skill === o.skill) continue;
    out.push(o);
  }
  return out.slice(0, count);
}

/** Challenges in a quest round: about two minutes (§7.10 "Listen 2 min · Rhythm 2 min"). */
export function questRoundLength(group: QuestGroup): number {
  return group === 'listening' ? 3 : 2;
}

/** The picks, with the last one swapped when they are exactly `before`'s games and another game exists. */
function notSameAs(picks: QuestOption[], before: readonly GameId[], options: readonly QuestOption[]): QuestOption[] {
  const same = picks.length > 1 && picks.length === before.length && picks.every((o) => before.includes(o.game));
  if (!same) return picks;
  const last = picks[picks.length - 1];
  const swap =
    options.find((o) => !picks.some((p) => p.game === o.game) && o.group === last.group) ??
    options.find((o) => !picks.some((p) => p.game === o.game));
  return swap ? [...picks.slice(0, -1), swap] : picks;
}

/**
 * Today's quest lines. `seeds`: hash of student + date (rng.ts roundSeed) for the last days, oldest first, today last
 * (a week is plenty): each day's picks are worked out from the oldest, every day kept from being the day before's, so
 * today is never what yesterday showed. `doneToday`: games with a quest round today.
 */
export function questLines(input: {
  options: readonly QuestOption[];
  count: number;
  seeds: readonly number[];
  doneToday: readonly GameId[];
}): QuestLine[] {
  const count = Math.max(QUEST_MIN_LINES, Math.min(QUEST_MAX_LINES, Math.round(input.count) || QUEST_MIN_LINES));
  let before: GameId[] = [];
  let picks: QuestOption[] = [];
  for (const seed of input.seeds) {
    picks = notSameAs(questPick(input.options, count, seed), before, input.options);
    before = picks.map((o) => o.game);
  }
  return picks.map((o) => ({
    game: o.game,
    skill: o.skill,
    group: o.group,
    minutes: 2,
    len: questRoundLength(o.group),
    done: input.doneToday.includes(o.game),
  }));
}

/** Days of seeds questLines looks back over. */
export const QUEST_DAYS = 7;
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
