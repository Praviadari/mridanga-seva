// What the Playground's rhythm games ask with a challenge the engine made (docs/RHYTHM_PLAYGROUND.md §7.2, §7.11,
// §7.12; docs/DECISIONS.md #750-#753). The engine (lib/playground, W1) chose an approved exercise at an approved tempo;
// these only decide how it is played and asked — where a played cycle starts, how many cycles, which approved guna
// order — from a random generator seeded by the round's seed and the challenge's place, so the round's recipe rebuilds
// the same questions (DYN-06). They never add a bol: the beats are the exercise's own.
//
// - Tap the Beat (pulse mode): clicks on every beat (or only on sam), silent cycles in between; tap every beat.
// - Tāla Cycle Master: "where did the cycle start again?" on a grid (seen, then heard only); "how many cycles?";
//   then tap sam while the cycle goes on in silence.
// - Rhythm Switching: "how many strokes in each beat now?"; then tap the beat through the switches.
// The class's guna convention (D3) and tempo per level (D4) are data: the template's `gunaByLevel`, `orders`,
// `gunaBpmMax` and the exercise's tempo range — nothing here fixes 1/2/4/8 or 1/2/3/4.

import { MAX_LOOP_SECONDS, metronomePattern, withSilentCycles, type GunaSection, type Pattern } from '../practice-pattern';
import { hash32, makeRng, type Rng } from '../playground/rng';
import type { PlayTemplate, TemplateStep } from '../playground/types';

/** The random generator of one challenge: the round's seed and its place, so a replay asks the same. */
export function challengeRng(seed: number, at: number): Rng {
  return makeRng(hash32(`${seed}:${at}`));
}

const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

// ---------------------------------------------------------------- Tap the Beat: pulse mode (§7.2)

/** One pulse run: what loops, how long, and where the pulses are. */
export type PulseRun = {
  pattern: Pattern;
  /** Beats in one cycle of pulses (the exercise's length: 4 or 8 at Beginner). */
  cycleBeats: number;
  /** Cycles in the run, sounding and silent. */
  cycles: number;
  /** Silent cycles after each sounding one (0 = clicks all the way). */
  mute: number;
  /** Clicks only on sam. */
  samOnly: boolean;
  /** The beat is shown lit while it plays. */
  guide: boolean;
};

/**
 * Tap the Beat's run for a step: `{ mute: silent cycles after each sounding one, cycles: how many in all, samOnly:
 * clicks only on sam, guide: show the beat }`. Defaults: 4 cycles, clicks on every beat, guide on.
 */
export function pulseRun(cycleBeats: number, step: TemplateStep): PulseRun {
  const beats = Math.max(1, Math.round(cycleBeats));
  const mute = Math.max(0, Math.min(3, Math.round(num(step.mute, 0))));
  const samOnly = step.samOnly === true;
  const guide = step.guide !== false;
  const full = metronomePattern(beats);
  const bar = samOnly ? { ...full, events: full.events.slice(0, 1), key: `sam:${beats}` } : full;
  const pattern = mute > 0 ? withSilentCycles(bar, 1, mute) : bar;
  const per = 1 + mute;
  const cycles = Math.max(per, Math.ceil(num(step.cycles, 4) / per) * per);
  return { pattern, cycleBeats: beats, cycles, mute, samOnly, guide };
}

// ---------------------------------------------------------------- Tāla Cycle Master (§7.11)

export type TalaQuestion =
  | {
      ask: 'restart';
      /** The beats as heard, starting part-way through a cycle. */
      heard: string[];
      /** 0-based places in `heard` where the cycle starts again (several when the cycle repeats inside itself). */
      right: number[];
      /** The answer key: the first right place, counted from 1. */
      answer: string;
      /** The bols are shown on the grid (the "visual" step). */
      grid: boolean;
    }
  | { ask: 'count'; cycles: number; choices: string[]; answer: string }
  | { ask: 'sam'; mute: number; cycles: number };

/** Places in `heard` where `cycle` starts whole. */
export function restartPlaces(heard: readonly string[], cycle: readonly string[]): number[] {
  const out: number[] = [];
  for (let i = 0; i + cycle.length <= heard.length; i++) {
    if (cycle.every((b, j) => heard[i + j] === b)) out.push(i);
  }
  return out;
}

/**
 * The question of a step: `{ ask: 'restart' | 'count' | 'sam', grid, cycles: [min, max] (count) or the run's
 * cycles (sam), mute: silent cycles after each sounding one (sam) }`. "restart" plays from a beat after sam (never
 * at sam, §7.11 "not always at sam") to the end of the next whole cycle.
 */
export function talaQuestion(cycle: readonly string[], step: TemplateStep, rng: Rng): TalaQuestion {
  const n = cycle.length;
  const ask = step.ask === 'count' || step.ask === 'sam' ? step.ask : 'restart';
  if (ask === 'count') {
    const range = Array.isArray(step.cycles) ? step.cycles : [2, 4];
    const lo = Math.max(1, Math.round(num(range[0], 2)));
    const hi = Math.max(lo, Math.round(num(range[1], lo)));
    const k = rng.int(lo, hi);
    const first = Math.max(1, Math.min(k - 1, hi - 1));
    const choices = [first, first + 1, first + 2].map(String);
    return { ask, cycles: k, choices, answer: String(k) };
  }
  if (ask === 'sam') {
    const mute = Math.max(0, Math.min(3, Math.round(num(step.mute, 1))));
    const per = 1 + mute;
    const cycles = Math.max(per, Math.ceil(num(step.cycles, 2 * per) / per) * per);
    return { ask, mute, cycles };
  }
  const from = n > 1 ? rng.int(1, n - 1) : 0;
  const heard = [...cycle.slice(from), ...cycle];
  const right = restartPlaces(heard, cycle);
  return { ask, heard, right, answer: String((right[0] ?? 0) + 1), grid: step.grid !== false };
}

/** Is a place (counted from 1) where the cycle starts again? */
export function isRestart(q: Extract<TalaQuestion, { ask: 'restart' }>, given: string): boolean {
  return q.right.includes(Number(given) - 1);
}

/** The pattern a "sam" run loops: one cycle sounding, `mute` silent; the whole cycle when nothing is silent. */
export function samRunPattern(cyclePattern: Pattern, mute: number): Pattern {
  return mute > 0 ? withSilentCycles(cyclePattern, 1, mute) : cyclePattern;
}

// ---------------------------------------------------------------- Rhythm Switching (§7.12)

/** The highest tempo a guna may be played at, from the template's `gunaBpmMax` ({"8": 60}); null = no cap. */
export function gunaCap(template: PlayTemplate | null, guna: number): number | null {
  const caps = template?.params.gunaBpmMax;
  if (!caps || typeof caps !== 'object') return null;
  const v = (caps as Record<string, unknown>)[String(guna)];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** The guna that may be played at this tempo: allowed (exercise + level) and under its cap. */
export function playableGuna(allowed: readonly number[], template: PlayTemplate | null, bpm: number): number[] {
  return [...new Set(allowed)].filter((g) => {
    const cap = gunaCap(template, g);
    return cap === null || bpm <= cap;
  }).sort((a, b) => a - b);
}

/**
 * The approved switch orders (template `orders`, e.g. [[1, 2, 4, 1]]) that use only playable guna. Without any set,
 * up through the playable guna and back to 1 ([1, 2, 1] at Beginner when 1-2 are allowed); null when only one guna
 * is playable (nothing to switch).
 */
export function switchOrders(template: PlayTemplate | null, playable: readonly number[]): number[][] | null {
  const raw = template?.params.orders;
  const set = Array.isArray(raw)
    ? raw.filter((o): o is number[] => Array.isArray(o) && o.length >= 2 && o.every((g) => typeof g === 'number' && playable.includes(g)))
    : [];
  if (set.length > 0) return set;
  const up = playable.filter((g) => g > 1);
  if (!playable.includes(1) || up.length === 0) return null;
  return [[1, ...up, 1]];
}

export type SwitchQuestion =
  | { ask: 'name'; sections: GunaSection[]; guna: number; choices: string[]; answer: string }
  | { ask: 'tap'; sections: GunaSection[]; cue: boolean };

/**
 * The question of a step: `{ ask: 'name' | 'tap', cue: the section's name and subdivision dots are shown }`. "name"
 * plays one cycle at guna 1, then one at another playable guna; "tap" plays an approved order, `cyclesPerSection`
 * (template, default 2) cycles each, fewer when the loop would pass the phone's 160 s. null = nothing playable.
 */
export function switchQuestion(
  cycleBeats: number,
  bpm: number,
  playable: readonly number[],
  template: PlayTemplate | null,
  step: TemplateStep,
  rng: Rng,
): SwitchQuestion | null {
  if (step.ask === 'name') {
    const others = playable.filter((g) => g > 1);
    const guna = rng.pick(others);
    if (guna === undefined || !playable.includes(1)) return null;
    return { ask: 'name', sections: [{ guna: 1, cycles: 1 }, { guna, cycles: 1 }], guna, choices: playable.map(String), answer: String(guna) };
  }
  const orders = switchOrders(template, playable);
  const order = orders ? rng.pick(orders) : undefined;
  if (!order) return null;
  let cycles = Math.max(1, Math.round(num(template?.params.cyclesPerSection, 2)));
  while (cycles > 1 && (order.length * cycles * cycleBeats * 60) / bpm > MAX_LOOP_SECONDS) cycles--;
  return { ask: 'tap', sections: order.map((guna) => ({ guna, cycles })), cue: step.cue !== false };
}
