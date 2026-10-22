// Reads every row of a list that may pass PostgREST's 1,000-row cap (audit phase 1 P1-19, D9-04;
// docs/DECISIONS.md #325). The server answers at most 1,000 rows per request, oldest first for the fund,
// so a plain read silently lost the newest entries and the balance went wrong. The caller passes a
// function that builds the same ordered query with .range(from, to); pages are read until one comes
// back short. The order must be total (end with a unique column such as id) so no row is skipped.

/** PostgREST's default max rows per request (Supabase "Max rows"). */
export const PAGE_ROWS = 1000;

/** Rows kept at most, so a runaway list cannot hang a phone: 50 pages. */
export const MAX_ROWS = 50_000;

type Page<T> = { data: T[] | null; error: { message: string; code?: string } | null };

/**
 * Every row of `page`, read 1,000 at a time. `page(from, to)` must return a fresh query with
 * `.range(from, to)` (a query object cannot be awaited twice). The first error stops the read and is
 * returned with data null, as a single read would.
 */
export async function readAllRows<T>(page: (from: number, to: number) => PromiseLike<Page<T>>, pageRows = PAGE_ROWS): Promise<Page<T>> {
  const rows: T[] = [];
  for (let from = 0; from < MAX_ROWS; from += pageRows) {
    const { data, error } = await page(from, from + pageRows - 1);
    if (error) return { data: null, error };
    rows.push(...(data ?? []));
    if (!data || data.length < pageRows) break;
  }
  return { data: rows, error: null };
}
