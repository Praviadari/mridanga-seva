// What the four listening games' screens do with a challenge (docs/RHYTHM_PLAYGROUND.md §7.1, §7.4, §7.6, §7.8;
// docs/DECISIONS.md #731-#734): what to play, how a card or tile is written and said, and the answer given. The
// engine (lib/playground, package W1) made the challenge from approved content; these never add a bol of their own,
// so what a card plays is what it shows (the same notation, the same player as the taal player).
//
// - Sound Detective: a bol or phrase plays; the student picks its card. Each card can be heard after the answer.
// - Missing Beat: the approved sequence plays with the gap beats silent; one pick per gap, in order.
// - Rhythm Builder: tap a tile, then tap its place (no dragging); rests are already in place; checked by sound.
// - Tempo Detective: A, a short quiet, then B on one clock; afterwards both drawn as beat dots spaced by time.

import { taalPattern, type Pattern } from '../practice-pattern';
import { answerKey, keyBeats, REST, sameSound, writtenBeat, writtenKey, type BolIndex } from '../playground/notation';
import type { Choice, Prompt } from '../playground/types';

// ---------------------------------------------------------------- shared

/** The beats as the player plays them (one bol, or several in one beat, per count; '-' silent). */
export function beatsPattern(beats: readonly string[]): Pattern {
  return taalPattern([...beats]);
}

/** A card or tile as written by the class: 'dha te.re' → 'dhā te·re'. */
export function choiceText(choice: Choice, index: BolIndex): string {
  return writtenKey(choice.key, index);
}

/** Which hand plays a single-bol card: the dayan is played by the right hand, the baya by the left. */
export function choiceHands(choice: Choice, index: BolIndex): 'right' | 'left' | 'both' | null {
  const beats = keyBeats(choice.key);
  if (beats.length !== 1 || beats[0].includes('.')) return null;
  const head = index.get(beats[0])?.head;
  return head === 'dayan' ? 'right' : head === 'baya' ? 'left' : head === 'both' ? 'both' : null;
}

/** What a card plays: its own beats, so its sound is its label. */
export function choicePattern(choice: Choice): Pattern {
  return beatsPattern(keyBeats(choice.key));
}

// ---------------------------------------------------------------- Missing Beat

/** The sequence as heard in the question: each gap a rest. */
export function heardBeats(prompt: Pick<Prompt, 'beats' | 'gaps'>): string[] {
  return prompt.beats.map((beat, i) => (prompt.gaps.includes(i) ? REST : beat));
}

/** The grid's cells: each beat written, '?' for a gap not yet answered, the pick for one answered. */
export function gridCells(prompt: Pick<Prompt, 'beats' | 'gaps'>, picks: readonly string[], index: BolIndex, reveal: boolean): string[] {
  return prompt.beats.map((beat, i) => {
    const gap = prompt.gaps.indexOf(i);
    if (gap < 0 || reveal) return beat === REST ? '–' : writtenBeat(beat, index);
    const pick = picks[gap];
    return pick ? writtenBeat(pick, index) : '?';
  });
}

/** The answer given for all gaps, in gap order ('ta na'). */
export function gapsGiven(picks: readonly string[]): string {
  return answerKey(picks);
}

// ---------------------------------------------------------------- Rhythm Builder

/** The places as filled: the index of the tile (in `choices`) in each place, null = empty. */
export type Placed = readonly (number | null)[];

/** Empty places, one per beat. */
export function emptyPlaces(beats: readonly string[]): (number | null)[] {
  return beats.map(() => null);
}

/** True for a rest: already in place, takes no tile. */
export function isFixed(beats: readonly string[], at: number): boolean {
  return beats[at] === REST;
}

/** Puts tile `tile` in place `at` (taking it out of any other place); a rest's place takes nothing. */
export function placeTile(beats: readonly string[], placed: Placed, tile: number, at: number): (number | null)[] {
  if (isFixed(beats, at)) return [...placed];
  return placed.map((p, i) => (i === at ? tile : p === tile ? null : p));
}

/** Takes the tile out of place `at`. */
export function takeTile(placed: Placed, at: number): (number | null)[] {
  return placed.map((p, i) => (i === at ? null : p));
}

/** True when every place but the rests has a tile. */
export function allPlaced(beats: readonly string[], placed: Placed): boolean {
  return beats.every((_, i) => isFixed(beats, i) || placed[i] !== null);
}

/** The order as placed, in the notation ('-' for a rest or an empty place): what "Play mine" plays. */
export function placedBeats(beats: readonly string[], choices: readonly Choice[], placed: Placed): string[] {
  return beats.map((_, i) => {
    if (isFixed(beats, i)) return REST;
    const tile = placed[i];
    return tile === null || tile === undefined ? REST : (choices[tile]?.key ?? REST);
  });
}

/** The places whose tile does not sound as the approved beat (a tile that sounds the same counts as right). */
export function placesToHearAgain(beats: readonly string[], choices: readonly Choice[], placed: Placed, index: BolIndex): number[] {
  const mine = placedBeats(beats, choices, placed);
  return beats.flatMap((beat, i) => (beat === REST || sameSound(beat, mine[i], index) ? [] : [i]));
}

/** The approved order in the places, each tile used once (shown after the last try). */
export function rightPlaces(beats: readonly string[], choices: readonly Choice[], index: BolIndex): (number | null)[] {
  const used = new Set<number>();
  return beats.map((beat) => {
    if (beat === REST) return null;
    const tile = choices.findIndex((c, i) => !used.has(i) && sameSound(c.key, beat, index));
    if (tile < 0) return null;
    used.add(tile);
    return tile;
  });
}

// ---------------------------------------------------------------- Tempo Detective

/** Beats of quiet between A and B, at A's tempo. */
export const TEMPO_GAP_BEATS = 2;

/**
 * A, a short quiet, then B, as one pattern on A's clock: B's events are spaced by bpmA / bpmB beats, so both have
 * the same bols and loudness and only the tempo tells them apart.
 */
export function bothPattern(beats: readonly string[], bpmA: number, bpmB: number): { pattern: Pattern; bpm: number } {
  const one = beatsPattern(beats);
  const scale = bpmA / bpmB;
  const offset = one.beats + TEMPO_GAP_BEATS;
  const events = [...one.events, ...one.events.map((ev) => ({ ...ev, at: offset + ev.at * scale }))].sort((x, y) => x.at - y.at);
  return {
    pattern: { beats: Math.ceil(offset + one.beats * scale), events, key: `tempo:${beats.join(' ')}:${bpmA}:${bpmB}` },
    bpm: bpmA,
  };
}

/** The beats of A and B in seconds from each one's start, for the picture after the answer. */
export function beatTimes(count: number, bpmA: number, bpmB: number): { a: number[]; b: number[] } {
  return {
    a: Array.from({ length: count }, (_, i) => (i * 60) / bpmA),
    b: Array.from({ length: count }, (_, i) => (i * 60) / bpmB),
  };
}
