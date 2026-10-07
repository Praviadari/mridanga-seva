// Text compared in a search box, the same way on every screen (docs/I18N.md): lower case, and Latin
// accents and IAST diacritics taken off, so "krsna" finds "Kṛṣṇa" and "jose" finds "José".
// Only the combining marks of Latin letters (U+0300-U+036F) are removed: Telugu and Devanagari vowel
// signs are letters of their words and stay, so a Telugu or Hindi name is found as typed.

/** `text` folded for a search: lower case, without Latin accents, single spaces, trimmed. */
export function searchFold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}
