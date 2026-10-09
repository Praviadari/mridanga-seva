// The name search of C5 Mark attendance as a database filter (src/data/attendance.ts). Pure, so the
// unit tests can check it (tests/app-correctness.test.mjs).

/**
 * The search text reduced to letters (any script, with their vowel signs), digits, spaces and
 * hyphens. Anything else could be read as part of the database query's own syntax; dots and
 * commas become spaces, so 'K. Sri' searches the words K and Sri (FS2-04).
 */
export function cleanSearchText(text: string): string {
  return text
    .replace(/[^\p{L}\p{M}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The PostgREST `or` filter for a cleaned search text: the name holds every word, in any order, or
 * the roll number contains the whole text. 'K Sri' → 'and(full_name.ilike.*K*,full_name.ilike.*Sri*),roll_no.ilike.*K Sri*'.
 */
export function studentSearchFilter(query: string): string {
  const words = query.split(' ');
  const name =
    words.length === 1 ? `full_name.ilike.*${query}*` : `and(${words.map((w) => `full_name.ilike.*${w}*`).join(',')})`;
  return `${name},roll_no.ilike.*${query}*`;
}
