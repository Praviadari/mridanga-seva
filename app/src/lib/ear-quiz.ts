// "Which bol?" ear quiz (docs/DECISIONS.md #471): the app sounds a bol, or a short phrase of 2-4 bols, and the student
// picks it from three cards with the hand drawings. The bols come from the taals of the chosen level and the levels
// before it (a taal for every level counts for each), so a Beginner hears Beginner bols; a few first bols are added
// when the taals give fewer than three. Two bols that sound the same in the app (ke and ka, tin and tī) are one card,
// written as the Guru's taal writes it. The questions are chance; a gentle "in a row" count, no score for others.

import { readBol, type Bol } from './bols';
import { readTaal, type Pattern } from './practice-pattern';

/** What the quiz needs of a taal (data/practice.ts Taal). */
export type QuizTaal = { bols: readonly string[]; levelId: number | null; active: boolean };

/** One card's bol. `key` is how it sounds: two bols with the same key are the same to the ear. */
export type QuizBol = { text: string; bol: Bol; key: string };

/** The first bols of the course, for a level whose taals give fewer than three. */
export const FIRST_BOLS = ['tā', 'nā', 'tī', 'te', 'ka', 'ga', 'gha', 'dhā'] as const;

/** How a bol sounds in the app: its strokes, in order. */
export function soundKey(bol: Bol): string {
  return bol.strokes
    .map((s) => `${s.head}:${s.sound}:${s.delay ?? 0}`)
    .sort()
    .join('+');
}

function quizBol(text: string): QuizBol | null {
  const bol = readBol(text);
  if (bol.unknown || bol.strokes.length === 0) return null;
  return { text, bol, key: soundKey(bol) };
}

/** The taals of a level: switched on, for that level, a level before it, or every level. */
export function levelTaals<T extends QuizTaal>(taals: readonly T[], levelId: number): T[] {
  return taals.filter((tl) => tl.active && (tl.levelId === null || tl.levelId <= levelId));
}

/** The bols of a level, each sound once, in the order the taals bring them; at least three. */
export function quizBols(taals: readonly QuizTaal[], levelId: number): QuizBol[] {
  const pool: QuizBol[] = [];
  const add = (text: string) => {
    const found = quizBol(text);
    if (found && !pool.some((b) => b.key === found.key)) pool.push(found);
  };
  for (const tl of levelTaals(taals, levelId)) {
    for (const parts of readTaal(tl.bols)) for (const bol of parts) if (bol.text !== '-') add(bol.text);
  }
  for (const text of FIRST_BOLS) {
    if (pool.length >= 3) break;
    add(text);
  }
  return pool;
}

/** A short phrase: 2-4 bols. */
export type QuizPhrase = { bols: QuizBol[]; key: string };

const phraseOf = (bols: QuizBol[]): QuizPhrase => ({ bols, key: bols.map((b) => b.key).join(' ') });

/** The phrases of `length` bols played one after the other in the level's taals (rests skipped, round the cycle). */
export function quizPhrases(taals: readonly QuizTaal[], levelId: number, length: number): QuizPhrase[] {
  const phrases: QuizPhrase[] = [];
  for (const tl of levelTaals(taals, levelId)) {
    const strokes = readTaal(tl.bols)
      .flat()
      .map((bol) => (bol.text === '-' ? null : quizBol(bol.text)))
      .filter((b): b is QuizBol => b !== null);
    if (strokes.length < length) continue;
    for (let i = 0; i < strokes.length; i++) {
      const phrase = phraseOf(Array.from({ length }, (_, k) => strokes[(i + k) % strokes.length]));
      if (!phrases.some((p) => p.key === phrase.key)) phrases.push(phrase);
    }
  }
  return phrases;
}

/** A random number 0 ≤ x < 1 (Math.random in the app; a fixed sequence in the tests). */
export type Random = () => number;

function pick<T>(list: readonly T[], random: Random): T {
  return list[Math.min(list.length - 1, Math.floor(random() * list.length))];
}

function shuffle<T>(list: readonly T[], random: Random): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(random() * (i + 1)));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** One question: the phrase sounded (one bol for single bols) and three cards, the answer among them. */
export type QuizQuestion = { answer: QuizPhrase; cards: QuizPhrase[] };

/**
 * A question of single bols: one of `pool` (not the one just asked, when there is another) and two others. null when
 * the pool has fewer than three bols.
 */
export function bolQuestion(pool: readonly QuizBol[], random: Random, lastKey: string | null = null): QuizQuestion | null {
  if (pool.length < 3) return null;
  const fresh = pool.filter((b) => b.key !== lastKey);
  const answer = pick(fresh.length > 0 ? fresh : pool, random);
  const others = shuffle(pool.filter((b) => b.key !== answer.key), random).slice(0, 2);
  return { answer: phraseOf([answer]), cards: shuffle([answer, ...others], random).map((b) => phraseOf([b])) };
}

/**
 * A question of phrases: one of the level's phrases of `length` bols; each other card is the same phrase with one bol
 * changed for another of the pool (in a different place for each card), so the ear must follow the whole phrase.
 * Without taals to take phrases from, phrases are made from the pool. null when the pool has fewer than three bols.
 */
export function phraseQuestion(
  phrases: readonly QuizPhrase[],
  pool: readonly QuizBol[],
  length: number,
  random: Random,
  lastKey: string | null = null,
): QuizQuestion | null {
  if (pool.length < 3) return null;
  const fresh = phrases.filter((p) => p.key !== lastKey);
  const answer =
    fresh.length > 0 ? pick(fresh, random) : phraseOf(Array.from({ length }, () => pick(pool, random)));
  const cards: QuizPhrase[] = [answer];
  const places = shuffle(answer.bols.map((_, i) => i), random);
  for (let tries = 0; cards.length < 3 && tries < 40; tries++) {
    const place = places[tries % places.length];
    const swap = pick(pool.filter((b) => b.key !== answer.bols[place].key), random);
    const changed = phraseOf(answer.bols.map((b, i) => (i === place ? swap : b)));
    if (!cards.some((c) => c.key === changed.key)) cards.push(changed);
  }
  if (cards.length < 3) return null;
  return { answer, cards: shuffle(cards, random) };
}

/** The phrase as the player plays it: one bol a beat, each bol's strokes as in the taal player. */
export function phrasePattern(phrase: QuizPhrase): Pattern {
  const events = phrase.bols.flatMap((b, beat) =>
    b.bol.strokes.map((stroke) => ({ at: beat + (stroke.delay ?? 0), beat, part: 0, sound: stroke.sound })),
  );
  return { beats: phrase.bols.length, events: events.sort((a, b) => a.at - b.at), key: `phrase:${phrase.key}` };
}

/** True when the card picked is the answer (by sound, so the same bol written two ways counts). */
export function isRight(question: QuizQuestion, card: QuizPhrase): boolean {
  return card.key === question.answer.key;
}

/** The written form shown on a card: "dhā ge nā". */
export function phraseText(phrase: QuizPhrase): string {
  return phrase.bols.map((b) => b.text).join(' ');
}
