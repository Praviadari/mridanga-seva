// The search text of the staff's student searches (C5 Mark attendance, src/data/attendance.ts; lending,
// src/data/inventory.ts). The database function search_students (0039) finds students whose name holds
// every word, or whose roll number contains the whole text. Pure, so the unit tests can check it
// (tests/app-correctness.test.mjs).

/**
 * The search text reduced to letters (any script, with their vowel signs), digits, spaces and
 * hyphens; dots and commas become spaces, so 'K. Sri' searches the words K and Sri (FS2-04).
 */
export function cleanSearchText(text: string): string {
  return text
    .replace(/[^\p{L}\p{M}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
