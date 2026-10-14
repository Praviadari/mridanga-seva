// Splits a help text into its first sentence and the rest (UI audit 14-10-2026, docs/DECISIONS.md #363): screens
// show one line and an ⓘ button for the rest, instead of a paragraph above the content. Works for English, Telugu
// (".") and Hindi ("।"); never splits after a common abbreviation like "e.g.". Pure, so tests run it.

/** Words that end in a full stop without ending the sentence. */
const ABBREVIATIONS = ['e.g.', 'i.e.', 'etc.', 'vs.', 'Dr.', 'Mr.', 'Mrs.', 'Ms.', 'Sri.', 'No.', 'approx.'];

/** A first sentence shorter than this keeps the next one with it ("Optional. ..." alone says too little). */
const MIN_FIRST = 24;

/** A rest shorter than this is not worth hiding behind a button. */
const MIN_REST = 16;

/** The first sentence and the rest ('' when the text is one sentence or too short to split). */
export function firstSentence(text: string): { first: string; rest: string } {
  const whole = text.trim();
  const end = /[.!?।](?=\s+\S)/g;
  let match: RegExpExecArray | null;
  while ((match = end.exec(whole)) !== null) {
    const cut = match.index + 1;
    const before = whole.slice(0, cut);
    if (ABBREVIATIONS.some((word) => before.endsWith(` ${word}`) || before === word)) continue;
    if (cut < MIN_FIRST) continue;
    const rest = whole.slice(cut).trim();
    if (rest.length < MIN_REST) return { first: whole, rest: '' };
    return { first: before, rest };
  }
  return { first: whole, rest: '' };
}
