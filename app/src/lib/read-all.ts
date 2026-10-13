// Reads a whole table or view page by page (audit D9-04 / P1-19, phase 4 P5; docs/DECISIONS.md #330). The
// database sends at most 1,000 rows per call (Supabase's max-rows), so one plain read of a class past 1,000
// students silently lost every name after the 1,000th. A page of PAGE_ROWS is asked for until a shorter one
// comes back. The query must be ordered on something unique (add .order('id') last), or rows can move between
// pages.

/** Rows per call: Supabase's max-rows. A smaller server limit would end the reading early, so keep them equal. */
export const PAGE_ROWS = 1000;

/** At most this many pages (50,000 rows): a guard against a server that ignores the range. */
const MAX_PAGES = 50;

/** One page's answer; its rows are taken as T (the caller's row type, as the plain reads cast them). */
type Page = PromiseLike<{ data: unknown; error: unknown }>;

/**
 * Every row of a read, in order; null when any page could not be loaded.
 * @param page builds the read for rows from..to (inclusive), e.g.
 *   `(from, to) => supabase.from('x').select('a, b').order('a').order('id').range(from, to)`.
 */
export async function readAllPages<T>(page: (from: number, to: number) => Page): Promise<T[] | null> {
  const rows: T[] = [];
  for (let n = 0; n < MAX_PAGES; n += 1) {
    const from = n * PAGE_ROWS;
    const { data, error } = await page(from, from + PAGE_ROWS - 1);
    if (error || !Array.isArray(data)) return null;
    rows.push(...(data as T[]));
    if (data.length < PAGE_ROWS) return rows;
  }
  return rows;
}
