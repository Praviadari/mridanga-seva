// The adaptive rules (docs/RHYTHM_PLAYGROUND.md §8.8, DYN-04; #726): rules-based, per student, per game, per step,
// to be calibrated in the pilot. They only offer; the student chooses, and nothing moves by itself.
//   - offer harder after 2 rounds in a row at the step with ≥ 80 % right and ≤ 1 replay per item on average;
//   - offer easier after 2 rounds in a row below 50 %;
//   - mixed results: stay;
//   - back after 14+ days: start one step lower as a warm-up;
//   - by hand: any step up to the highest reached; the facilitator's minimum and maximum always win;
//   - timing games adapt only on a calibrated phone (otherwise no offer: tempo choice only);
//   - correctness and replays only, never speed.

import type { PlayedRound, StepAdvice, StepLimits } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;
export const HARDER_SHARE = 0.8;
export const EASIER_SHARE = 0.5;
export const MAX_AVG_REPLAYS = 1;
export const AWAY_DAYS = 14;

export type AdviceInput = {
  /** This game's rounds, any order. */
  rounds: readonly PlayedRound[];
  /** The template's highest step. */
  topStep: number;
  /** The facilitator's limits for this student and game (assignment or settings). */
  limits?: StepLimits;
  /** A timing game: adapts only when `calibrated`. */
  timing?: boolean;
  calibrated?: boolean;
  now: number;
};

/** Share right and replays per item of a round; null for a round with no marked items. */
export function roundScore(round: PlayedRound): { share: number; replays: number } | null {
  const marked = round.items.filter((i) => typeof i.ok === 'boolean');
  if (marked.length === 0) return null;
  const right = marked.filter((i) => i.ok).length;
  const replays = round.items.reduce((sum, i) => sum + (i.rp ?? 0), 0) / round.items.length;
  return { share: right / marked.length, replays };
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** The advice for the next round of one game. */
export function stepAdvice(input: AdviceInput): StepAdvice {
  const top = Math.max(1, input.topStep);
  const min = clamp(input.limits?.min ?? 1, 1, top);
  const max = clamp(input.limits?.max ?? top, min, top);
  const done = [...input.rounds]
    .filter((r) => r.finishedAt !== null)
    .sort((a, b) => Date.parse(a.finishedAt ?? a.startedAt) - Date.parse(b.finishedAt ?? b.startedAt));
  const highest = done.reduce((h, r) => Math.max(h, r.step), min);
  const choosable: number[] = [];
  for (let s = min; s <= clamp(highest, min, max); s++) choosable.push(s);

  if (done.length === 0) return { step: min, offer: null, offerStep: null, warmUp: false, choosable };
  const last = done[done.length - 1];
  const current = clamp(last.step, min, max);
  const lastAt = Date.parse(last.finishedAt ?? last.startedAt);
  if (input.now - lastAt >= AWAY_DAYS * DAY_MS) {
    const warm = clamp(current - 1, min, max);
    return { step: warm, offer: null, offerStep: null, warmUp: warm < current, choosable };
  }
  if (input.timing && !input.calibrated) return { step: current, offer: null, offerStep: null, warmUp: false, choosable };

  const atStep = done.filter((r) => r.step === last.step).slice(-2).map(roundScore);
  const lastTwo = atStep.length === 2 && atStep.every((s) => s !== null) ? (atStep as { share: number; replays: number }[]) : null;
  if (lastTwo && lastTwo.every((s) => s.share >= HARDER_SHARE && s.replays <= MAX_AVG_REPLAYS) && current < max) {
    return { step: current, offer: 'harder', offerStep: current + 1, warmUp: false, choosable };
  }
  if (lastTwo && lastTwo.every((s) => s.share < EASIER_SHARE) && current > min) {
    return { step: current, offer: 'easier', offerStep: current - 1, warmUp: false, choosable };
  }
  return { step: current, offer: null, offerStep: null, warmUp: false, choosable };
}

/**
 * The facilitator's limits for a game: the student's settings, narrowed by an assignment's (the override wins
 * over the student's own choice; the narrower of the two applies).
 */
export function stepLimits(settingsLimits: StepLimits | undefined, assignment: { stepMin: number | null; stepMax: number | null } | null): StepLimits {
  const min = Math.max(settingsLimits?.min ?? 1, assignment?.stepMin ?? 1);
  const maxes = [settingsLimits?.max, assignment?.stepMax ?? undefined].filter((n): n is number => typeof n === 'number');
  return maxes.length > 0 ? { min, max: Math.max(min, Math.min(...maxes)) } : { min };
}
