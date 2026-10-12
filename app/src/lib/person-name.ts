// A person's name as typed in a form: letters of any script (Telugu, Hindi, English ...), with
// spaces, dots, apostrophes and hyphens between them; never digits or other signs (Praveen's test
// 12-10-2026, docs/DECISIONS.md #267). Pure functions, unit-tested (tests/form-checks.test.mjs).

import type { MessageKey } from '@/auth/auth-actions';

/** What is wrong with a typed name; null when it is fine. */
export type NameProblem = 'required' | 'digits' | 'symbols' | 'tooShort' | 'tooLong';

/** Options for checkPersonName. */
export type NameRules = {
  /** An empty box is a problem. Default true. */
  required?: boolean;
  /** Fewest letters. Default 2. */
  min?: number;
  /** Most characters after cleaning. Default 80. */
  max?: number;
};

// Zero-width joiner and non-joiner: Telugu and Hindi keyboards put them inside some words.
const JOINERS = '\\u200C\\u200D';
// Between words: space, dot, apostrophe (straight or curly), hyphen.
const SEPARATORS = " .'\\u2019\\-";

/** A letter or a combining mark (vowel signs of Indic scripts) of any script, when the engine knows \p{…}. */
function unicodeLetter(): RegExp | null {
  try {
    return new RegExp(`^[\\p{L}\\p{M}${JOINERS}]$`, 'u');
  } catch {
    return null;
  }
}

// Fallback for an engine without Unicode property classes: Latin, Greek, Cyrillic and the Indic
// blocks (Devanagari to Malayalam and Sinhala) without their digits and danda signs.
const LETTER_RANGES = new RegExp(
  '^[A-Za-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u024F\\u0300-\\u036F\\u0370-\\u03FF\\u0400-\\u04FF' +
    '\\u0900-\\u0963\\u0970-\\u09E5\\u09F0-\\u0A65\\u0A70-\\u0AE5\\u0AF0-\\u0B65\\u0B70-\\u0BE5' +
    '\\u0BF0-\\u0C65\\u0C70-\\u0CE5\\u0CF0-\\u0D65\\u0D70-\\u0DFF' +
    `${JOINERS}]$`,
);
const LETTER = unicodeLetter() ?? LETTER_RANGES;

/** True for one letter, vowel sign or joiner. `useFallback` is for the tests of the fallback. */
export function isNameLetter(char: string, useFallback = false): boolean {
  return (useFallback ? LETTER_RANGES : LETTER).test(char);
}

// Any digit: 0-9 and the digits of Indic scripts and full-width digits (src/lib/digits.ts).
const DIGIT = /[0-9०-९০-৯੦-੯૦-૯୦-୯௦-௯౦-౯೦-೯൦-൯０-９]/;
const SEPARATOR = new RegExp(`^[${SEPARATORS}]$`);

/**
 * The name as it is kept: Unicode NFC (one code for a letter with its accent or vowel sign, so the same
 * name typed on two keyboards is the same text; the SQL clean_person_name does the same), no spaces at
 * the ends, one space between words.
 */
export function cleanName(text: string): string {
  let name = text;
  try {
    name = name.normalize('NFC');
  } catch {
    // An engine without normalize keeps the text as typed.
  }
  return name.trim().replace(/\s+/g, ' ');
}

/**
 * What is wrong with a typed name, or null. A name starts with a letter, has at least `min` letters,
 * and between letters only single spaces, dots, apostrophes or hyphens ("K. Rama-Krishna", "D'Souza").
 */
export function checkPersonName(text: string, rules: NameRules = {}, useFallback = false): NameProblem | null {
  const { required = true, min = 2, max = 80 } = rules;
  const name = cleanName(text);
  if (!name) return required ? 'required' : null;
  if (DIGIT.test(name)) return 'digits';
  const chars = Array.from(name);
  let letters = 0;
  let previousSeparator = false;
  for (const [i, char] of chars.entries()) {
    if (isNameLetter(char, useFallback)) {
      letters += 1;
      previousSeparator = false;
    } else if (SEPARATOR.test(char)) {
      // Not first; not two signs together, except a dot or apostrophe before a space ("K. Rama").
      if (i === 0 || (previousSeparator && !(char === ' ' && chars[i - 1] !== ' '))) return 'symbols';
      previousSeparator = true;
    } else {
      return /\d/.test(char) ? 'digits' : 'symbols';
    }
  }
  // A dot may end a name ("Rao Jr."); a hyphen or apostrophe may not.
  if (/[-'’]$/.test(name)) return 'symbols';
  if (letters < min) return 'tooShort';
  if (name.length > max) return 'tooLong';
  return null;
}

/** The message for a problem: one wording on every form (en/te/hi `validation.name*`). */
export function nameMessage(problem: NameProblem, requiredKey: MessageKey = 'validation.nameRequired'): MessageKey {
  switch (problem) {
    case 'required':
      return requiredKey;
    case 'digits':
      return 'validation.nameDigits';
    case 'symbols':
      return 'validation.nameSymbols';
    case 'tooShort':
      return 'validation.nameTooShort';
    case 'tooLong':
      return 'validation.nameTooLong';
  }
}

/** The message key for a typed name, or undefined when it is fine. */
export function nameError(text: string, rules?: NameRules, requiredKey?: MessageKey): MessageKey | undefined {
  const problem = checkPersonName(text, rules);
  return problem ? nameMessage(problem, requiredKey) : undefined;
}
