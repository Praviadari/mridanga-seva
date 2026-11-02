// The class's written mark for a bol (docs/NOTATION.md, agreed 02-11-2026; docs/DECISIONS.md #782, #783): a capital I
// per finger of the right hand, then C (closed) or O (open); the left hand ● khe, O ga, ▲ ge; / re; + played together.
// One default mark per bol, the Beginner lessons' — a mantra's own line may use another finger count (te is IIIC in
// the Intermediate notes), so lesson text keeps its own marks. A mark is shown beside a bol, never part of it
// (notation.ts): the bol stays the dictionary id and `written` its spelling.
// #789 (updates #783; the team's draft of 02-11-2026: technique follows the chapter, not the bol's spelling): a game card
// shows these marks only for an exercise of the Beginner level, where they are the lesson's; any other exercise shows the
// bol and its hand alone (exerciseMarks), until an exercise can carry marks of its own.

import { beatBols, keyBeats, REST } from './notation';

const MARKS: Readonly<Record<string, string>> = {
  te: 'IIIIC',
  ta: 'IIIIO',
  re: '/',
  khe: '●',
  ga: 'O',
  ge: '▲',
  jha: 'O+IIIIO',
  tak: '●+IIIIO',
};

/** The default mark of one bol id ('te' → 'IIIIC'), or null when the class key has none for it. */
export function bolMark(id: string): string | null {
  return MARKS[id] ?? null;
}

/** A beat's marks run together as the team writes them ('te.re' → 'IIIIC/', 'khe.ta' → '●IIIIO'); null if any is unknown. */
export function beatMark(beat: string): string | null {
  if (beat === REST) return '–';
  const marks = beatBols(beat).map(bolMark);
  return marks.length > 0 && marks.every((m) => m !== null) ? marks.join('') : null;
}

/** An answer key's marks, beats separated by spaces; null if a bol has no mark (then none is shown). */
export function keyMarks(key: string): string | null {
  const beats = keyBeats(key);
  const marks = beats.map(beatMark);
  return beats.length > 0 && beats.some((b) => b !== REST) && marks.every((m) => m !== null) ? marks.join(' ') : null;
}

/** The level whose lessons the default marks come from: Beginner (#789). */
export const MARKS_LEVEL = 1;

/** A card's marks for an exercise of `levelId`: the defaults at the Beginner level only, else null (no marks shown). */
export function exerciseMarks(key: string, levelId: number | null | undefined): string | null {
  return levelId === MARKS_LEVEL ? keyMarks(key) : null;
}
