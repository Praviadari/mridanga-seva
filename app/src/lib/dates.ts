// Date helpers. The class runs in India, so "today" always means today in India (IST), whatever
// time zone the phone or computer is set to — the same rule the database uses (today_ist()).
// Dates travel as ISO text 'YYYY-MM-DD', which is what Postgres `date` columns accept.

/** Today's date in India as 'YYYY-MM-DD'. */
export function todayInIndia(): string {
  // IST is UTC + 5 h 30 min all year (India has no daylight saving).
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * Reads a date typed as day-month-year, the way people in India write it: 15-06-2012,
 * 15/06/2012 or 15.06.2012. Returns 'YYYY-MM-DD', or null if it is not a real date.
 */
export function parseDayMonthYear(text: string): string | null {
  const match = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(text.trim());
  if (!match) return null;
  const [day, month, year] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  // Date.UTC rolls 31-02 over into March; a real date comes back unchanged.
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

/** Full years between an ISO birth date and an ISO day (both 'YYYY-MM-DD'). */
export function ageOn(birthDate: string, day: string): number {
  const [by, bm, bd] = birthDate.split('-').map(Number);
  const [y, m, d] = day.split('-').map(Number);
  const hadBirthday = m > bm || (m === bm && d >= bd);
  return y - by - (hadBirthday ? 0 : 1);
}

/**
 * True when a person born on `birthDate` is under 18 on `day`. Under 18 means a parent's
 * consent is needed (docs/DECISIONS.md #8). The database makes the final check.
 */
export function isMinorOn(birthDate: string, day: string): boolean {
  return ageOn(birthDate, day) < 18;
}
