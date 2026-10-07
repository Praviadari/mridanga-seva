// Date helpers. "Today" and every time of day are the class's: the time zone of the signed-in
// person's centre (./class-locale.ts; India until known), whatever zone the phone or computer is
// set to — the same rule the database uses (today_ist(), migration 0033). Dates travel as ISO text
// 'YYYY-MM-DD', which is what Postgres `date` columns accept. docs/I18N.md.

import { currentLanguage } from '@/i18n';

import { classLocale } from './class-locale';

// India is UTC + 5 h 30 min all year (no daylight saving), so for it shifting by this much and
// reading the UTC fields gives the time without relying on the phone's time zone data — exactly as
// before 0033. Other zones (with summer time) are read through Intl.
const INDIA = 'Asia/Kolkata';
const INDIA_OFFSET_MIN = 330;

const partFormatters = new Map<string, Intl.DateTimeFormat | null>();

function partFormatter(zone: string): Intl.DateTimeFormat | null {
  if (!partFormatters.has(zone)) {
    let formatter: Intl.DateTimeFormat | null = null;
    try {
      formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: zone,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      formatter = null; // a zone this phone does not know: India time is used instead
    }
    partFormatters.set(zone, formatter);
  }
  return partFormatters.get(zone) ?? null;
}

/** Minutes `zone` is ahead of UTC at the moment `ms` (India's 330 if the phone cannot tell). */
export function zoneOffsetMinutes(ms: number, zone: string = classLocale().timeZone): number {
  if (zone === INDIA) return INDIA_OFFSET_MIN;
  const formatter = partFormatter(zone);
  if (!formatter) return INDIA_OFFSET_MIN;
  try {
    const part: Record<string, number> = {};
    for (const p of formatter.formatToParts(new Date(ms))) part[p.type] = Number(p.value);
    const wall = Date.UTC(part.year, part.month - 1, part.day, part.hour % 24, part.minute, part.second);
    const offset = Math.round((wall - Math.floor(ms / 1000) * 1000) / 60_000);
    return Number.isFinite(offset) ? offset : INDIA_OFFSET_MIN;
  } catch {
    return INDIA_OFFSET_MIN;
  }
}

/** The class's wall clock at the moment `ms`, as an ISO text without zone: '2026-09-30T16:05:00.000'. */
function wallClock(ms: number): string {
  return new Date(ms + zoneOffsetMinutes(ms) * 60_000).toISOString().slice(0, 23);
}

/** '+05:30', '-04:00'. */
function offsetText(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

/** Today's date at the class as 'YYYY-MM-DD'. */
export function todayLocal(): string {
  return wallClock(Date.now()).slice(0, 10);
}

/** The date at the class of a moment from the database (an ISO timestamp), as 'YYYY-MM-DD'. */
export function localDate(timestamp: string): string {
  return wallClock(Date.parse(timestamp)).slice(0, 10);
}

/**
 * The time of day at the class of a moment from the database, as 24-hour 'HH:MM', e.g. '16:05'.
 * 24-hour time reads the same in English, Telugu and Hindi, with no AM/PM to translate.
 */
export function localTime(timestamp: string): string {
  return wallClock(Date.parse(timestamp)).slice(11, 16);
}

/**
 * A day and a time of day at the class as one ISO timestamp the database understands:
 * ('2026-10-04', '18:30') → '2026-10-04T18:30:00+05:30' in India. The offset is the one in force
 * at that moment (summer time abroad).
 */
export function localMoment(isoDate: string, timeOfDay: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const [hh, mm] = timeOfDay.split(':').map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  const offset = zoneOffsetMinutes(wall - zoneOffsetMinutes(wall) * 60_000);
  return `${isoDate}T${timeOfDay}:00${offsetText(offset)}`;
}

/** Midnight at the start of today at the class, as an ISO timestamp the database understands. */
export function startOfTodayLocal(): string {
  return localMoment(todayLocal(), '00:00');
}

/**
 * The locale for Intl: the app's language with the class's country, e.g. 'te-IN', 'en-US'
 * (BCP 47). Formats follow the country, words the language.
 */
export function intlLocale(): string {
  return `${currentLanguage()}-${classLocale().country}`;
}

const monthDayFormatters = new Map<string, Intl.DateTimeFormat | null>();

/**
 * An ISO date 'YYYY-MM-DD' for reading. India keeps day-month-year with dashes, '29-09-2026', as
 * the class has always written it (and as dates are typed). Elsewhere the month is a word in the
 * app's language, in the country's order ('Sep 29, 2026' in the US, '29 Sept 2026' in the UK), so
 * nobody reads 04-10 as April 10 or October 4.
 */
export function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  if (classLocale().country === 'IN') return `${day}-${month}-${year}`;
  const locale = intlLocale();
  if (!monthDayFormatters.has(locale)) {
    let formatter: Intl.DateTimeFormat | null = null;
    try {
      formatter = new Intl.DateTimeFormat(locale, { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      formatter = null;
    }
    monthDayFormatters.set(locale, formatter);
  }
  const formatter = monthDayFormatters.get(locale);
  if (!formatter) return isoDate; // ISO 8601: unambiguous everywhere
  try {
    return formatter.format(new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))));
  } catch {
    return isoDate;
  }
}

/**
 * An ISO date as it is typed into a date field: day-month-year, '04-10-2026', in every country
 * (the hints ask for it; parseDayMonthYear reads it back). For form fields only: text for reading
 * uses formatDate.
 */
export function formatTypedDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${day}-${month}-${year}`;
}

/**
 * Reads a typed date: day-month-year (15-06-2012, 15/06/2012 or 15.06.2012), which the hints ask
 * for in every language, or ISO 8601 year-month-day (2012-06-15), which nobody misreads.
 * Returns 'YYYY-MM-DD', or null if it is not a real date.
 */
export function parseDayMonthYear(text: string): string | null {
  const trimmed = text.trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed);
  const dmy = iso ? null : /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(trimmed);
  if (!iso && !dmy) return null;
  const [year, month, day] = iso
    ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
    : [Number(dmy![3]), Number(dmy![2]), Number(dmy![1])];
  const date = new Date(Date.UTC(year, month - 1, day));
  // Date.UTC rolls 31-02 over into March; a real date comes back unchanged.
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

/**
 * Reads a time of day typed as 24-hour hours and minutes: 18:30, 9:05 or 18.30.
 * Returns 'HH:MM', or null if it is not a real time.
 */
export function parseTimeOfDay(text: string): string | null {
  const match = /^(\d{1,2})[:.](\d{2})$/.exec(text.trim());
  if (!match) return null;
  const [hours, minutes] = [Number(match[1]), Number(match[2])];
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${match[2]}`;
}

/** A moment from the database as the date and 24-hour time at the class: '30-09-2026 16:05' in India. */
export function formatDateTime(timestamp: string): string {
  return `${formatDate(localDate(timestamp))} ${localTime(timestamp)}`;
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
 * consent is needed (docs/DECISIONS.md #8). The database makes the final check. 18 is India's
 * age (DPDP); other countries' ages are a team decision (docs/I18N.md).
 */
export function isMinorOn(birthDate: string, day: string): boolean {
  return ageOn(birthDate, day) < 18;
}
