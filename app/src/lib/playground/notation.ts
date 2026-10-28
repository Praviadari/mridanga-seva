// One bol notation for every game (docs/RHYTHM_PLAYGROUND.md §8.1, #691; #722): the taal notation of 0018. A
// sequence is a list of beats; a beat is '-' (rest) or 1-4 bols joined with '.' ('te.re' = two half-beats). In the
// Playground's tables a bol is written as its dictionary id, the plain form (lib/bols.ts plainBol: 'dhā' →
// 'dha'); the class's spelling is the dictionary's `written`, for display. Guna, tempo, vibhags and marks are
// separate fields, never part of the bols. The database checks the same shape (0065 guard_play_exercise).
//
// An answer key is the beats joined with a space ('te.re khe ta'). Two keys "sound the same" when every bol
// matches the other's or is in its sounds-alike list (either way round): the rule record_round uses too.

import { plainBol } from '@/lib/bols';

import type { PlayBol } from './types';

/** A beat in the Playground's tables: '-' or 1-4 dictionary ids (a-z, 1-10 letters) joined with '.'. */
const BEAT = /^(-|[a-z]{1,10}(\.[a-z]{1,10}){0,3})$/;
export const REST = '-';
export const MAX_BEATS = 32;

export function isBeat(beat: string): boolean {
  return BEAT.test(beat);
}

/** 1-32 beats, each a valid beat. */
export function isSequence(beats: readonly string[]): boolean {
  return beats.length >= 1 && beats.length <= MAX_BEATS && beats.every(isBeat);
}

/** The bol ids of one beat; none for a rest. */
export function beatBols(beat: string): string[] {
  return beat === REST || beat === '' ? [] : beat.split('.');
}

/** Every bol id a sequence uses, each once, in order. */
export function sequenceBols(beats: readonly string[]): string[] {
  const out: string[] = [];
  for (const beat of beats) for (const bol of beatBols(beat)) if (!out.includes(bol)) out.push(bol);
  return out;
}

/** A written beat ('Tā.Re') in the tables' form ('ta.re'). */
export function plainBeat(beat: string): string {
  const trimmed = beat.trim();
  if (trimmed === REST || trimmed === '') return REST;
  return trimmed.split('.').map(plainBol).join('.');
}

/** The answer key of some beats. */
export function answerKey(beats: readonly string[]): string {
  return beats.join(' ');
}

/** The beats of an answer key. */
export function keyBeats(key: string): string[] {
  return key === '' ? [] : key.split(' ');
}

/** The dictionary by id. */
export type BolIndex = ReadonlyMap<string, PlayBol>;

export function bolIndex(bols: readonly PlayBol[]): BolIndex {
  return new Map(bols.map((b) => [b.id, b]));
}

/** Two bol ids sound the same: equal, or either lists the other as sounding alike. */
export function sameBolSound(a: string, b: string, index: BolIndex): boolean {
  if (a === b) return true;
  return Boolean(index.get(a)?.soundsLike.includes(b) || index.get(b)?.soundsLike.includes(a));
}

/** Two answer keys of bols sound the same, beat by beat and bol by bol. Other keys ('faster') must be equal. */
export function sameSound(a: string, b: string, index: BolIndex): boolean {
  if (a === b) return true;
  const beatsA = keyBeats(a);
  const beatsB = keyBeats(b);
  if (beatsA.length !== beatsB.length) return false;
  return beatsA.every((beat, i) => {
    const x = beatBols(beat);
    const y = beatBols(beatsB[i]);
    if (beat === REST || beatsB[i] === REST) return beat === beatsB[i];
    return x.length === y.length && x.every((bol, j) => sameBolSound(bol, y[j], index));
  });
}

/** A beat as the class writes it: 'te.re' → 'te·re' with the dictionary's spellings; a rest stays '-'. */
export function writtenBeat(beat: string, index: BolIndex): string {
  if (beat === REST) return REST;
  return beatBols(beat)
    .map((id) => index.get(id)?.written ?? id)
    .join('·');
}

/** An answer key as the class writes it, beats separated by spaces. */
export function writtenKey(key: string, index: BolIndex): string {
  return keyBeats(key)
    .map((beat) => writtenBeat(beat, index))
    .join(' ');
}
