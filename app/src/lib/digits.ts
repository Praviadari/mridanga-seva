// Digits typed with another script's keyboard, read as 0-9.

// The zero of each script's digits a phone keyboard may type: Devanagari (Hindi), Bengali, Gurmukhi,
// Gujarati, Odia, Tamil, Telugu, Kannada, Malayalam, and full-width digits.
const DIGIT_ZEROS = [0x0966, 0x09e6, 0x0a66, 0x0ae6, 0x0b66, 0x0be6, 0x0c66, 0x0ce6, 0x0d66, 0xff10];

// Explicit ranges, not \p{Nd}: plain character classes work in every JavaScript engine.
const OTHER_DIGITS = new RegExp(
  `[${DIGIT_ZEROS.map((zero) => `\\u${zero.toString(16).padStart(4, '0')}-\\u${(zero + 9).toString(16).padStart(4, '0')}`).join('')}]`,
  'g',
);

/**
 * The text with every digit of those scripts turned into 0-9, e.g. Hindi '१५-०६-२०१२' → '15-06-2012':
 * an Indic keyboard types its own digits, and the checks read only 0-9 (audit D8-16).
 */
export function asciiDigits(text: string): string {
  return text.replace(OTHER_DIGITS, (digit) => {
    const code = digit.charCodeAt(0);
    const zero = DIGIT_ZEROS.find((z) => code >= z && code <= z + 9) ?? code;
    return String(code - zero);
  });
}
