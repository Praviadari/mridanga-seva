// Echo me, call and response (docs/DECISIONS.md #472): the class's own way of teaching, the Guru plays and the student
// plays it back. The app plays one vibhag of a taal (the call), then leaves the same length silent (the answer), with
// soft clicks on its beats when wished, so the student keeps the time; then the next vibhag, round the taal, or one
// vibhag again and again. All of it is one looping pattern for the practice player (lib/practice-pattern.ts), so the
// timing is the audio clock's as in the taal player. Answers tapped on the pads are graded like the play-along
// (lib/tap-grading.ts), with only the answer's strokes expected.

import { taalPattern, type Pattern, type PatternEvent } from './practice-pattern';
import { CLOSE_MS, taalHits, type ExpectedHit, type PadHand } from './tap-grading';

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

// ---------------------------------------------------------------- Echo Challenge rounds (Rhythm Playground, #752)

/** One call from the exercise bank and its answer window, played once. */
export type EchoCall = {
  pattern: Pattern;
  /** Beats of the call; the answer window is as long (§7.3 acceptance). */
  length: number;
  /** Silent beats between the call and the answer (recall after a delay: one silent cycle), 0 = none. */
  delay: number;
  /** Where the answer window starts, beats. */
  answerStart: number;
  /** The call's strokes moved into the answer window: what pad answers are graded against. */
  answers: ExpectedHit[];
};

/**
 * A bank call (an approved sequence, §7.3): the call, then `delay` silent cycles of the same length, then the answer
 * window of the same length with a soft click on each beat when `clicks`. Nothing else is added to the music.
 */
export function echoCall(sequence: readonly string[], clicks: boolean, delayCycles = 0): EchoCall | null {
  if (sequence.length === 0) return null;
  const length = sequence.length;
  const delay = Math.max(0, Math.round(delayCycles)) * length;
  const answerStart = length + delay;
  const events: PatternEvent[] = taalPattern(sequence).events.map((e) => ({ ...e }));
  if (clicks) for (let k = 0; k < length; k++) events.push({ at: answerStart + k, beat: k, part: 0, sound: 'click' });
  events.sort((a, b) => a.at - b.at);
  return {
    pattern: { beats: answerStart + length, events, key: `echo-call:${sequence.join(' ')}:${delay}:${clicks ? 'clicks' : 'quiet'}` },
    length,
    delay,
    answerStart,
    answers: taalHits(sequence).map((h) => ({ ...h, at: h.at + answerStart })),
  };
}

/** Is loop beat `beat` inside the call's answer window? */
export function inAnswer(call: Pick<EchoCall, 'answerStart' | 'length'>, beat: number): boolean {
  return beat >= call.answerStart && beat < call.answerStart + call.length;
}

/** A pad tap of an answer: which pad and when (absolute beats, moved by the phone's delay). */
export type EchoTap = { hand: PadHand; at: number };

/** How a pad answer went: the order of hands, and each stroke's timing. */
export type EchoGrade = {
  /** The hands tapped in order, 'R L R R' (what the round saves as the answer given). */
  given: string;
  /** The hands of the call in order. */
  expected: string;
  /** The same strokes in the same order (§7.3: "which strokes matched in order"). */
  orderOk: boolean;
  /** Each stroke of the call: its tap error, ms (negative = early), or null when no tap of that hand was near. */
  errorsMs: (number | null)[];
};

const handLetter = (hand: PadHand) => (hand === 'left' ? 'L' : 'R');

/** Hands in time order; strokes this close together (both hands at once, dhā) are sorted, so their order is free. */
function handOrder(items: readonly { hand: PadHand; at: number }[], togetherBeats: number): string {
  const sorted = [...items].sort((a, b) => a.at - b.at);
  const groups: { hand: PadHand; at: number }[][] = [];
  for (const it of sorted) {
    const last = groups[groups.length - 1];
    if (last && it.at - last[0].at <= togetherBeats) last.push(it);
    else groups.push([it]);
  }
  return groups.flatMap((g) => g.map((x) => handLetter(x.hand)).sort()).join(' ');
}

/**
 * Grades a pad answer: only taps inside the answer window (with half a beat either side) count; the order of hands
 * is compared, and each stroke takes the nearest unused tap of its hand within the play-along's window.
 */
export function gradeEcho(call: Pick<EchoCall, 'answerStart' | 'length' | 'answers'>, taps: readonly EchoTap[], bpm: number): EchoGrade {
  const beatMs = 60000 / bpm;
  const inside = taps.filter((t) => t.at >= call.answerStart - 0.5 && t.at < call.answerStart + call.length + 0.5);
  const together = 30 / beatMs;
  const used = new Set<number>();
  const errorsMs = call.answers.map((hit) => {
    let best = -1;
    inside.forEach((t, i) => {
      if (used.has(i) || t.hand !== hit.hand) return;
      const d = Math.abs(t.at - hit.at) * beatMs;
      if (d <= CLOSE_MS && (best < 0 || d < Math.abs(inside[best].at - hit.at) * beatMs)) best = i;
    });
    if (best < 0) return null;
    used.add(best);
    return Math.round((inside[best].at - hit.at) * beatMs);
  });
  const given = handOrder(inside, together);
  const expected = handOrder(call.answers, together);
  return { given, expected, orderOk: given === expected, errorsMs };
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
