// Echo me, call and response (docs/DECISIONS.md #472): the class's own way of teaching, the Guru plays and the student
// plays it back. The app plays one vibhag of a taal (the call), then leaves the same length silent (the answer), with
// soft clicks on its beats when wished, so the student keeps the time; then the next vibhag, round the taal, or one
// vibhag again and again. All of it is one looping pattern for the practice player (lib/practice-pattern.ts), so the
// timing is the audio clock's as in the taal player. Answers tapped on the pads are graded like the play-along
// (lib/tap-grading.ts), with only the answer's strokes expected.

import { taalPattern, type Pattern, type PatternEvent } from './practice-pattern';
import { taalHits, type ExpectedHit } from './tap-grading';

/** One call and its answer in the loop. */
export type EchoSegment = {
  /** Which vibhag of the taal (0-based). */
  vibhag: number;
  /** Where the call starts in the loop, beats; the answer starts `length` beats later. */
  start: number;
  /** Beats in the vibhag. */
  length: number;
  /** Where the vibhag starts in the taal, beats. */
  taalStart: number;
};

/** What Echo me loops. */
export type EchoPlan = { pattern: Pattern; segments: EchoSegment[]; answers: ExpectedHit[] };

/** The first beat of each vibhag. Divisions that do not add up to the taal's beats count as one vibhag. */
export function vibhagStarts(beats: number, divisions: readonly number[]): { start: number; length: number }[] {
  const ok = divisions.length > 0 && divisions.every((d) => Number.isInteger(d) && d > 0) && divisions.reduce((a, b) => a + b, 0) === beats;
  if (!ok) return [{ start: 0, length: beats }];
  let start = 0;
  return divisions.map((length) => {
    const vibhag = { start, length };
    start += length;
    return vibhag;
  });
}

/**
 * The loop: each chosen vibhag (`vibhag` = one of them, null = all in turn) as a call, then as long silent for the
 * answer, with a click on each of its beats when `clicks`. null for an empty taal.
 */
export function echoPlan(bols: readonly string[], divisions: readonly number[], vibhag: number | null, clicks: boolean): EchoPlan | null {
  if (bols.length === 0) return null;
  const all = vibhagStarts(bols.length, divisions);
  const chosen = vibhag === null ? all.map((v, i) => ({ ...v, vibhag: i })) : all[vibhag] ? [{ ...all[vibhag], vibhag }] : [];
  if (chosen.length === 0) return null;
  const taal = taalPattern(bols).events;
  const hits = taalHits(bols);
  const events: PatternEvent[] = [];
  const answers: ExpectedHit[] = [];
  const segments: EchoSegment[] = [];
  let at = 0;
  for (const v of chosen) {
    const inside = (x: number) => x >= v.start - 1e-9 && x < v.start + v.length - 1e-9;
    segments.push({ vibhag: v.vibhag, start: at, length: v.length, taalStart: v.start });
    for (const e of taal) if (inside(e.at)) events.push({ ...e, at: at + e.at - v.start });
    if (clicks) {
      for (let k = 0; k < v.length; k++) events.push({ at: at + v.length + k, beat: v.start + k, part: 0, sound: 'click' });
    }
    for (const h of hits) if (inside(h.at)) answers.push({ ...h, at: at + v.length + h.at - v.start });
    at += 2 * v.length;
  }
  events.sort((a, b) => a.at - b.at);
  return {
    pattern: { beats: at, events, key: `echo:${bols.join(' ')}:${divisions.join('+')}:${vibhag ?? 'all'}:${clicks ? 'clicks' : 'quiet'}` },
    segments,
    answers: answers.sort((a, b) => a.at - b.at),
  };
}

/** Where the loop is: which call or answer, and the beat in it (0-based). */
export type EchoPlace = { segment: EchoSegment; phase: 'call' | 'answer'; beat: number };

/** The place at `beat` beats into the loop. */
export function echoPlace(segments: readonly EchoSegment[], beat: number): EchoPlace | null {
  for (const segment of segments) {
    const into = beat - segment.start;
    if (into >= 0 && into < 2 * segment.length) {
      return into < segment.length
        ? { segment, phase: 'call', beat: Math.floor(into) }
        : { segment, phase: 'answer', beat: Math.floor(into - segment.length) };
    }
  }
  return null;
}
