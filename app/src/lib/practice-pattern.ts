// What the practice player loops: one cycle of sounds, each at a position counted in beats from
// the start of the cycle. The metronome's cycle is one bar (accent on beat 1); the taal player's is
// one taal cycle, a beat's bols spread evenly over the beat ('te.re' = two half-beats).
// The audio engines (lib/practice-audio.ts on phones, practice-audio.web.ts in the browser) turn
// beats into seconds with the tempo, so a tempo change needs no new pattern.

import { readBeat, type Bol, type SoundId } from './bols';
import type { PlayerPosition } from './practice-player';

/** A layer of sounds with its own volume, under the strokes (#492). */
export type Layer = 'kartal';

/** One sound in the cycle. */
export type PatternEvent = {
  /** Position in beats from the start of the cycle (0 ≤ at < beats). */
  at: number;
  /** The beat it belongs to (0-based; within one taal cycle when the pattern holds several). */
  beat: number;
  /** Which bol of the beat (0-based), for the two-head view. */
  part: number;
  sound: SoundId;
  /** A layer with its own volume; none = the strokes or clicks themselves. */
  layer?: Layer;
};

/** One cycle. */
export type Pattern = {
  /** Beats in the cycle. */
  beats: number;
  /** Sorted by `at`. */
  events: PatternEvent[];
  /** Same key = same sounds, so an engine can keep what it prepared. */
  key: string;
  /**
   * Silent cycles (#490): the loop is `play` cycles with sound and `mute` without, each `cycleBeats` long, so `beats`
   * = cycleBeats × (play + mute). Absent: the loop is one cycle.
   */
  silent?: { cycleBeats: number; play: number; mute: number };
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

/**
 * Layakari (#491): 1 = barabar (one written beat a beat), 2 = dugun, 3 = tigun, 4 = chaugun: so many written beats in
 * each beat of the cycle, the theka going round 2, 3 or 4 times in one cycle while sam and the vibhags stay.
 */
export type Laya = 1 | 2 | 3 | 4;

/** The layakari choices, in order. */
export const LAYAS: readonly Laya[] = [1, 2, 3, 4];

/** One written beat inside a beat of the cycle, at layakari: which written beat and its bols. */
export type LayaGroup = { from: number; bols: Bol[] };

/**
 * The taal at layakari `laya`: for each beat of the cycle, the `laya` written beats it holds, in order (beat b holds
 * written beats b × laya … b × laya + laya − 1, round the cycle). At 1 each beat holds its own.
 */
export function layaGroups(bols: readonly string[], laya: Laya = 1): LayaGroup[][] {
  const written = readTaal(bols);
  const n = written.length;
  return written.map((_, beat) =>
    Array.from({ length: laya }, (__, j) => {
      const from = (beat * laya + j) % n;
      return { from, bols: written[from] };
    }),
  );
}

/** The bols of each beat of the cycle at layakari, one after the other (what the two-head view reads by part). */
export function layaBeats(bols: readonly string[], laya: Laya = 1): Bol[][] {
  return layaGroups(bols, laya).map((groups) => groups.flatMap((g) => g.bols));
}

/**
 * How a beat reads at layakari, for the beat grid: each written beat as one word, its bols run together ('te.re' →
 * "tere"), the words apart, a rest as "–": dugun of dhā | ti → "dhā ti", of te.re | dhā → "tere dhā". At 1 the
 * beat's bols apart as before ("te re").
 */
export function layaText(groups: readonly LayaGroup[]): string {
  if (groups.length === 1) {
    const only = groups[0].bols;
    return only.length === 1 && only[0].text === '-' ? '–' : only.map((b) => b.text).join(' ');
  }
  return groups.map((g) => (g.bols.length === 1 && g.bols[0].text === '-' ? '–' : g.bols.map((b) => (b.text === '-' ? '–' : b.text)).join(''))).join(' ');
}

/**
 * Taal player: every stroke of every bol of one cycle; at layakari (#491) each beat holds `laya` written beats, each
 * a 1/laya of the beat, its bols spread evenly inside that.
 */
export function taalPattern(bols: readonly string[], laya: Laya = 1): Pattern {
  const events: PatternEvent[] = [];
  layaGroups(bols, laya).forEach((groups, beat) => {
    let part = 0;
    groups.forEach((group, j) => {
      const width = 1 / (laya * group.bols.length);
      group.bols.forEach((bol, k) => {
        const start = beat + j / laya + k * width;
        for (const stroke of bol.strokes) {
          events.push({ at: start + (stroke.delay ?? 0) * width, beat, part, sound: stroke.sound });
        }
        part++;
      });
    });
  });
  events.sort((a, b) => a.at - b.at);
  return { beats: bols.length, events, key: `taal:${bols.join(' ')}${laya > 1 ? `:x${laya}` : ''}` };
}

/**
 * The kartal layer (#492) under a taal: a ringing (open) kartal on the first beat of each vibhag, a short closed one on
 * every other beat; on the beats, also at dugun to chaugun. A plain time-keeping pattern until the Guru gives the
 * class's own.
 */
export function withKartal(pattern: Pattern, divisions: readonly number[]): Pattern {
  const starts = new Set<number>();
  let at = 0;
  for (const size of divisions) {
    starts.add(at);
    at += size;
  }
  if (starts.size === 0) starts.add(0);
  const kartal: PatternEvent[] = Array.from({ length: pattern.beats }, (_, beat) => ({
    at: beat,
    beat,
    part: -1,
    sound: starts.has(beat) ? 'kartal' : 'kartalClosed',
    layer: 'kartal',
  }));
  // At the same moment the kartal comes before the stroke (the playhead skips layers anyway).
  const events = [...kartal, ...pattern.events].sort((a, b) => a.at - b.at || (a.layer ? 0 : 1) - (b.layer ? 0 : 1));
  return { ...pattern, events, key: `${pattern.key}:kartal` };
}

/** Most cycles with sound, and without, in the silent-cycles trainer (#490). */
export const SILENT_CHOICES = [1, 2, 3, 4] as const;

/**
 * The longest loop, seconds, that the silent cycles may make: the phone mixes the whole loop into one WAV file
 * (practice-audio.ts; 160 s ≈ 7 MB at 22.05 kHz).
 */
export const MAX_LOOP_SECONDS = 160;

/** True when `play` + `mute` cycles of `cycleBeats` beats at `bpm` fit in one loop. */
export function silentFits(cycleBeats: number, bpm: number, play: number, mute: number): boolean {
  return bpm > 0 && (cycleBeats * (play + mute) * 60) / bpm <= MAX_LOOP_SECONDS;
}

/**
 * Silent cycles (#490): `play` cycles of the pattern with sound, then `mute` cycles of silence, round again. The
 * events keep their beat within the cycle; `silent` says how the loop is made.
 */
export function withSilentCycles(pattern: Pattern, play: number, mute: number): Pattern {
  if (play < 1 || mute < 1) return pattern;
  const events: PatternEvent[] = [];
  for (let c = 0; c < play; c++) {
    for (const e of pattern.events) events.push({ ...e, at: e.at + c * pattern.beats });
  }
  return {
    beats: pattern.beats * (play + mute),
    events,
    key: `${pattern.key}:silent${play}/${mute}`,
    silent: { cycleBeats: pattern.beats, play, mute },
  };
}

/**
 * Where a position in the loop is in taal cycles (#490): the beat within its cycle, which cycle of the loop it is
 * (0-based), and whether that cycle is a silent one. A loop of one cycle: as given, never silent.
 */
export function cycleAt(pattern: Pattern, beat: number): { beat: number; cycleInLoop: number; silent: boolean } {
  if (!pattern.silent) return { beat, cycleInLoop: 0, silent: false };
  const { cycleBeats, play } = pattern.silent;
  const cycleInLoop = Math.min(Math.floor(beat / cycleBeats), pattern.beats / cycleBeats - 1);
  return { beat: beat - cycleInLoop * cycleBeats, cycleInLoop, silent: cycleInLoop >= play };
}

/** Cycles in one loop: 1, or play + mute with silent cycles. */
export function cyclesPerLoop(pattern: Pattern): number {
  return pattern.silent ? pattern.silent.play + pattern.silent.mute : 1;
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
