// Date helpers. The class runs in India, so "today" always means today in India (IST), whatever
// time zone the phone or computer is set to — the same rule the database uses (today_ist()).
// Dates travel as ISO text 'YYYY-MM-DD', which is what Postgres `date` columns accept.

// IST is UTC + 5 h 30 min all year (India has no daylight saving), so shifting by this much and
// reading the UTC fields gives the time in India without relying on the phone's time zone data.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Today's date in India as 'YYYY-MM-DD'. */
export function todayInIndia(): string {
  return new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** The date in India of a moment from the database (an ISO timestamp), as 'YYYY-MM-DD'. */
export function dateInIndia(timestamp: string): string {
  return new Date(Date.parse(timestamp) + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * The time of day in India of a moment from the database, as 24-hour 'HH:MM', e.g. '16:05'.
 * 24-hour time reads the same in English, Telugu and Hindi, with no AM/PM to translate.
 */
export function timeInIndia(timestamp: string): string {
  return new Date(Date.parse(timestamp) + IST_OFFSET_MS).toISOString().slice(11, 16);
}

/** Midnight at the start of today in India, as an ISO timestamp the database understands. */
export function startOfTodayInIndia(): string {
  return `${todayInIndia()}T00:00:00+05:30`;
}

/** An ISO date 'YYYY-MM-DD' written the Indian way, day-month-year: '2026-09-29' → '29-09-2026'. */
export function formatDayMonthYear(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${day}-${month}-${year}`;
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
