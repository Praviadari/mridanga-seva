// What the practice player loops: one cycle of sounds, each at a position counted in beats from
// the start of the cycle. The metronome's cycle is one bar (accent on beat 1); the taal player's is
// one taal cycle, a beat's bols spread evenly over the beat ('te.re' = two half-beats).
// The audio engines (lib/practice-audio.ts on phones, practice-audio.web.ts in the browser) turn
// beats into seconds with the tempo, so a tempo change needs no new pattern.

import { readBeat, type Bol, type SoundId } from './bols';
import type { PlayerPosition } from './practice-player';

/** One sound in the cycle. */
export type PatternEvent = {
  /** Position in beats from the start of the cycle (0 ≤ at < beats). */
  at: number;
  /** The beat it belongs to (0-based). */
  beat: number;
  /** Which bol of the beat (0-based), for the two-head view. */
  part: number;
  sound: SoundId;
};

/** One cycle. */
export type Pattern = {
  /** Beats in the cycle. */
  beats: number;
  /** Sorted by `at`. */
  events: PatternEvent[];
  /** Same key = same sounds, so an engine can keep what it prepared. */
  key: string;
};

/** Metronome: one bar of `beatsPerBar` clicks, the first one accented. */
export function metronomePattern(beatsPerBar: number): Pattern {
  const events: PatternEvent[] = [];
  for (let beat = 0; beat < beatsPerBar; beat++) {
    events.push({ at: beat, beat, part: 0, sound: beat === 0 ? 'accent' : 'click' });
  }
  return { beats: beatsPerBar, events, key: `metronome:${beatsPerBar}` };
}

/** A taal's beats read into bols: beats[i] = the bols of beat i. */
export function readTaal(bols: readonly string[]): Bol[][] {
  return bols.map(readBeat);
}

/** Taal player: every stroke of every bol of one cycle. */
export function taalPattern(bols: readonly string[]): Pattern {
  const beats = readTaal(bols);
  const events: PatternEvent[] = [];
  beats.forEach((parts, beat) => {
    parts.forEach((bol, part) => {
      const start = beat + part / parts.length;
      for (const stroke of bol.strokes) {
        events.push({ at: start + (stroke.delay ?? 0) / parts.length, beat, part, sound: stroke.sound });
      }
    });
  });
  events.sort((a, b) => a.at - b.at);
  return { beats: bols.length, events, key: `taal:${bols.join(' ')}` };
}

/** The tempo the player runs at: the chosen beats a minute times the slow-down (0.5, 0.75 or 1). */
export function effectiveBpm(bpm: number, speed: number): number {
  return bpm * speed;
}

/** Lowest and highest metronome / taal tempo, beats a minute. */
export const MIN_BPM = 30;
export const MAX_BPM = 240;

/** Keeps a tempo inside 30-240 and whole. */
export function clampBpm(bpm: number): number {
  if (!Number.isFinite(bpm)) return 80;
  return Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(bpm)));
}

/**
 * Cycles completed between two readings of a player's position (lib/practice-player.ts). The browser counts cycles
 * itself; the phone's loop starts again at 0, so there a jump back of more than half the cycle is one cycle done.
 */
export function cyclesPassed(last: PlayerPosition | null, now: PlayerPosition, beats: number): number {
  if (!last) return 0;
  if (now.cycle > last.cycle) return now.cycle - last.cycle;
  if (now.cycle === last.cycle && now.beat < last.beat - beats / 2) return 1;
  return 0;
}

/** The speed trainer's settings (#400): up to `target`, `step` beats a minute faster after every `every` cycles. */
export type SpeedTrainer = { target: number; step: number; every: number };

/**
 * The speed trainer's tempo after `cycles` cycles from `base`: one step per `every` cycles, never past the target.
 * A target at or below the base keeps the base.
 */
export function trainerTempo(base: number, trainer: SpeedTrainer, cycles: number): number {
  if (trainer.target <= base || trainer.step <= 0 || trainer.every <= 0) return base;
  return clampBpm(Math.min(trainer.target, base + Math.floor(Math.max(0, cycles) / trainer.every) * trainer.step));
}

/** Cycles until the speed trainer's next step, or null when the target is reached. */
export function cyclesToNextStep(base: number, trainer: SpeedTrainer, cycles: number): number | null {
  if (trainerTempo(base, trainer, cycles) >= trainer.target) return null;
  return trainer.every - (Math.max(0, cycles) % trainer.every);
}

/**
 * The count-in (#403): one bar of clicks before beat 1. The metronome's bar; for a taal its first vibhag (sam's), which
 * is how a theka is counted in; 2-8 clicks.
 */
export function countInClicks(mode: 'metronome' | 'taal', beatsPerBar: number, divisions: readonly number[]): number {
  const bar = mode === 'metronome' ? beatsPerBar : divisions[0] ?? 4;
  return Number.isInteger(bar) ? Math.min(8, Math.max(2, bar)) : 4;
}

/** One stroke of the step mode (#404): a bol of the cycle that is not a rest, with its beat and place in the beat. */
export type Step = { beat: number; part: number; bol: Bol };

/** The bols of a taal one by one, rests left out, in the order they are played. */
export function taalSteps(bols: readonly string[]): Step[] {
  return readTaal(bols).flatMap((parts, beat) =>
    parts.flatMap((bol, part) => (bol.text === '-' || bol.strokes.length === 0 ? [] : [{ beat, part, bol }])),
  );
}

/** One bol as a pattern of one beat: what the step mode's "Hear it" plays. */
export function bolPattern(bol: Bol): Pattern {
  const events = bol.strokes.map((stroke) => ({ at: stroke.delay ?? 0, beat: 0, part: 0, sound: stroke.sound }));
  return { beats: 1, events: events.sort((a, b) => a.at - b.at), key: `bol:${bol.text}` };
}

/**
 * Tap tempo: from the times of the last taps (ms, oldest first), the tempo of their average gap.
 * A gap over 2 seconds starts again; null until there are two taps.
 */
export function tapTempo(taps: readonly number[]): number | null {
  const recent: number[] = [];
  for (let i = taps.length - 1; i >= 0; i--) {
    if (recent.length > 0 && recent[0] - taps[i] > 2000) break;
    recent.unshift(taps[i]);
    if (recent.length === 5) break;
  }
  if (recent.length < 2) return null;
  const gap = (recent[recent.length - 1] - recent[0]) / (recent.length - 1);
  return clampBpm(60000 / gap);
}
