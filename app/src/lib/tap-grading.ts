// Tap-pad play-along (docs/DECISIONS.md #470): the strokes of a taal cycle a student taps on two pads, the baya's on
// the left pad and the dayan's on the right, and how each tap is graded against the sound: on time, early or late, or
// a stray tap that matches no stroke. Times are read from the practice player's clock (lib/practice-player.ts
// position(): the audio clock in the browser, the looping file's place on a phone), never from JavaScript timers, and
// moved by the phone's own delay found once with "Tune to this phone" (calibrationOffset). Each finished cycle gets
// 0-3 stars. Echo me (lib/echo.ts) grades its answers with the same scorer. Nothing here leaves the phone.

import type { SoundId } from './bols';
import { readTaal } from './practice-pattern';
import type { PlayerPosition } from './practice-player';

/** The pad a stroke is tapped on: left = baya (left hand), right = dayan (right hand). */
export type PadHand = 'left' | 'right';

/** One stroke to tap in the cycle. */
export type ExpectedHit = {
  /** Position in beats from the start of the cycle. */
  at: number;
  hand: PadHand;
  /** The beat and the bol of the beat it belongs to (0-based), to show it. */
  beat: number;
  part: number;
  /** The stroke's sound, for the pad's own sound when the student plays the strokes. */
  sound: SoundId;
};

/** A tap this close to its stroke, either way, is on time, ms. */
export const ON_TIME_MS = 70;
/** A tap this close is early or late; further away it is a stray tap, ms (less when the strokes are closer). */
export const CLOSE_MS = 160;

/** Every stroke of one taal cycle with its pad; a rest and a bol the app does not know give none. Sorted by time. */
export function taalHits(bols: readonly string[]): ExpectedHit[] {
  const hits: ExpectedHit[] = [];
  readTaal(bols).forEach((parts, beat) => {
    parts.forEach((bol, part) => {
      if (bol.unknown) return;
      for (const stroke of bol.strokes) {
        hits.push({
          at: beat + (part + (stroke.delay ?? 0)) / parts.length,
          hand: stroke.head === 'baya' ? 'left' : 'right',
          beat,
          part,
          sound: stroke.sound,
        });
      }
    });
  });
  return hits.sort((a, b) => a.at - b.at);
}

/** How a tap was graded. */
export type TapGrade = 'onTime' | 'early' | 'late' | 'stray';

/** One graded tap: how far from its stroke (ms, negative = early) and which stroke, unless it was stray. */
export type TapResult = { grade: TapGrade; errorMs: number | null; hit: ExpectedHit | null };

/** One finished cycle. */
export type CycleScore = {
  cycle: number;
  /** Strokes in the cycle. */
  expected: number;
  onTime: number;
  /** Early or late. */
  close: number;
  missed: number;
  stray: number;
  stars: 0 | 1 | 2 | 3;
};

/** Stars for a cycle: on time counts 1, early or late 1/2, a stray tap takes 1/4 off; 85 % = 3, 60 % = 2, 30 % = 1. */
export function cycleStars(expected: number, onTime: number, close: number, stray: number): 0 | 1 | 2 | 3 {
  if (expected <= 0) return 0;
  const share = Math.max(0, onTime + close / 2 - stray / 4) / expected;
  return share >= 0.85 ? 3 : share >= 0.6 ? 2 : share >= 0.3 ? 1 : 0;
}

const msPerBeat = (bpm: number) => 60000 / bpm;
/** Beats to ms is not exact in floating point: a tap at exactly 70 ms is on time. */
const EPSILON_MS = 1e-6;

/**
 * Grades the taps of one play-along. Positions are absolute beats (cycles × beats + place in the cycle, see BeatClock).
 * `counts` says where in the cycle a stray tap counts against the student (Echo me: only while they answer).
 */
export class TapScorer {
  private readonly hits: ExpectedHit[];
  private readonly beats: number;
  private readonly counts: (beatInCycle: number) => boolean;
  /** Half the gap to the nearest other stroke of the same hand, in beats: a tap never takes a neighbour's stroke. */
  private readonly halfGap: number[];
  /** Strokes already tapped: `${cycle}:${index}`. */
  private readonly done = new Set<string>();
  private readonly tally = new Map<number, { onTime: number; close: number; stray: number }>();
  /** The first cycle not scored yet. */
  private nextCycle = 0;

  constructor(hits: readonly ExpectedHit[], beats: number, counts: (beatInCycle: number) => boolean = () => true) {
    this.hits = [...hits];
    this.beats = beats;
    this.counts = counts;
    this.halfGap = this.hits.map((hit, i) => {
      let gap = beats;
      this.hits.forEach((other, j) => {
        if (j === i || other.hand !== hit.hand) return;
        const d = Math.abs(other.at - hit.at);
        gap = Math.min(gap, d, beats - d);
      });
      return gap / 2;
    });
  }

  /** The strokes of one cycle. */
  get expected(): number {
    return this.hits.length;
  }

  private window(index: number, bpm: number): number {
    return Math.min(CLOSE_MS, this.halfGap[index] * msPerBeat(bpm));
  }

  private count(cycle: number) {
    let entry = this.tally.get(cycle);
    if (!entry) {
      entry = { onTime: 0, close: 0, stray: 0 };
      this.tally.set(cycle, entry);
    }
    return entry;
  }

  /** Grades a tap on `hand` at absolute beat `at`, the tempo being `bpm`. */
  tap(hand: PadHand, at: number, bpm: number): TapResult {
    const here = Math.floor(at / this.beats);
    let best: { cycle: number; index: number; errorMs: number } | null = null;
    for (let cycle = Math.max(this.nextCycle, here - 1); cycle <= here + 1; cycle++) {
      for (let index = 0; index < this.hits.length; index++) {
        const hit = this.hits[index];
        if (hit.hand !== hand || this.done.has(`${cycle}:${index}`)) continue;
        const errorMs = (at - (cycle * this.beats + hit.at)) * msPerBeat(bpm);
        if (Math.abs(errorMs) > this.window(index, bpm) + EPSILON_MS) continue;
        if (!best || Math.abs(errorMs) < Math.abs(best.errorMs)) best = { cycle, index, errorMs };
      }
    }
    if (!best) {
      const cycle = Math.max(here, this.nextCycle);
      const within = at - here * this.beats;
      if (at >= 0 && this.counts(within)) this.count(cycle).stray++;
      return { grade: 'stray', errorMs: null, hit: null };
    }
    const { cycle, index, errorMs } = best;
    this.done.add(`${cycle}:${index}`);
    const onTime = Math.abs(errorMs) <= ON_TIME_MS + EPSILON_MS;
    const entry = this.count(cycle);
    if (onTime) entry.onTime++;
    else entry.close++;
    return { grade: onTime ? 'onTime' : errorMs < 0 ? 'early' : 'late', errorMs: Math.round(errorMs), hit: this.hits[index] };
  }

  /** Scores the cycles that are over at absolute beat `at` (the last stroke's late window passed too). */
  close(at: number, bpm: number): CycleScore[] {
    const grace = CLOSE_MS / msPerBeat(bpm);
    const scores: CycleScore[] = [];
    while (this.hits.length > 0 && at >= (this.nextCycle + 1) * this.beats + grace) {
      const cycle = this.nextCycle;
      const entry = this.tally.get(cycle) ?? { onTime: 0, close: 0, stray: 0 };
      const expected = this.hits.length;
      scores.push({
        cycle,
        expected,
        onTime: entry.onTime,
        close: entry.close,
        missed: expected - entry.onTime - entry.close,
        stray: entry.stray,
        stars: cycleStars(expected, entry.onTime, entry.close, entry.stray),
      });
      this.tally.delete(cycle);
      for (let i = 0; i < expected; i++) this.done.delete(`${cycle}:${i}`);
      this.nextCycle++;
    }
    return scores;
  }
}

/**
 * Turns a player's positions into absolute beats. The browser counts cycles itself; the phone's loop starts again at
 * 0, so there a jump back of more than half the cycle is one cycle on (as practice-pattern.ts cyclesPassed). Every
 * position read must pass through here, in order.
 */
export class BeatClock {
  private last: PlayerPosition | null = null;
  private wraps = 0;
  private readonly beats: number;

  constructor(beats: number) {
    this.beats = beats;
  }

  next(position: PlayerPosition): number {
    const last = this.last;
    if (last && position.cycle === last.cycle && position.beat < last.beat - this.beats / 2) this.wraps++;
    this.last = position;
    return (position.cycle + this.wraps) * this.beats + position.beat;
  }
}

/** A tap read at absolute beat `at`, moved back by the phone's delay (`offsetMs`, from calibrationOffset). */
export function correctedBeat(at: number, offsetMs: number, bpm: number): number {
  return at - offsetMs / msPerBeat(bpm);
}

/** How far a tap was from the nearest beat, ms (negative = before it): the taps of "Tune to this phone". */
export function beatErrorMs(at: number, bpm: number): number {
  return (at - Math.round(at)) * msPerBeat(bpm);
}

/** Taps needed to tune, and the widest spread of the middle half of them that is still taken, ms. */
export const CALIBRATION_TAPS = 8;
export const CALIBRATION_SPREAD_MS = 120;

/**
 * The phone's delay from the taps on the clicks of "Tune to this phone": the middle value of their errors (the first
 * two taps left out, while the hand finds the beat). null = too few taps, or too uneven to trust (try again).
 */
export function calibrationOffset(errorsMs: readonly number[]): { offsetMs: number; spreadMs: number } | null {
  const used = errorsMs.slice(2);
  if (used.length < CALIBRATION_TAPS - 2) return null;
  const sorted = [...used].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))];
  const spreadMs = Math.round(at(0.75) - at(0.25));
  if (spreadMs > CALIBRATION_SPREAD_MS) return null;
  return { offsetMs: Math.round(at(0.5)), spreadMs };
}
