// Which "Did you know?" fact about the mṛdaṅga a home shows today (simple home, docs/DECISIONS.md
// #242). The same fact all day for everyone, the next one tomorrow, round and round. The facts are
// i18n keys facts.f1 ... facts.f<FACT_COUNT>, written for the app from the sourced research in the
// maintainers' notes (kksongs lessons, krishna.org, Wikipedia "Khol"), not copied text.

/** How many facts there are in the locale files (facts.f1 ... facts.f15). */
export const FACT_COUNT = 15;

/** The number (1 ... count) of the fact for the local day of `date`. */
export function factNumber(date: Date, count: number = FACT_COUNT): number {
  // Days since 1 Jan 1970 in the phone's own time zone, so the fact changes at local midnight.
  const localDay = Math.floor((date.getTime() - date.getTimezoneOffset() * 60_000) / 86_400_000);
  return (((localDay % count) + count) % count) + 1;
}
