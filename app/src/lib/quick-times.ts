// One-tap dates and times for the forms where a date and time are typed (audit phase 5 U4-05, docs/DECISIONS.md
// #343): an announcement sent later, a poll's closing, an event's day. A tap fills the typed fields, which stay
// editable. Pure: today's date and the time now (both at the class) come in, so it is tested without a clock.

import { addDays as plusDays, formatTypedDate } from './dates';

/** What a quick button says: its kind, and the time or the number of days it fills in. */
export type QuickLabel =
  | { kind: 'tonight'; time: string }
  | { kind: 'tomorrow'; time: string }
  | { kind: 'sunday'; time: string }
  | { kind: 'inDays'; count: number }
  | { kind: 'thisSunday' }
  | { kind: 'nextSunday' };

/** One quick button: its label and what it types ('DD-MM-YYYY', 'HH:MM'; no time = only the date). */
export type QuickTime = { key: string; label: QuickLabel; date: string; time?: string };

/** 0 = Sunday ... 6 = Saturday. */
function weekday(isoDate: string): number {
  return new Date(`${isoDate}T00:00:00Z`).getUTCDay();
}

/** Days from `today` to the next Sunday after today (1-7). */
function daysToNextSunday(today: string): number {
  return 7 - weekday(today) || 7;
}

/**
 * An announcement sent later: tonight 19:00 (only before 19:00), tomorrow 07:00, Sunday 07:00 (the next
 * Sunday after today; left out when that is tomorrow).
 * @param today 'YYYY-MM-DD' at the class; @param now 'HH:MM' at the class.
 */
export function announcementTimes(today: string, now: string): QuickTime[] {
  const out: QuickTime[] = [];
  if (now < '19:00') out.push({ key: 'tonight', label: { kind: 'tonight', time: '19:00' }, date: formatTypedDate(today), time: '19:00' });
  out.push({ key: 'tomorrow', label: { kind: 'tomorrow', time: '07:00' }, date: formatTypedDate(plusDays(today, 1)), time: '07:00' });
  const toSunday = daysToNextSunday(today);
  if (toSunday > 1) {
    out.push({ key: 'sunday', label: { kind: 'sunday', time: '07:00' }, date: formatTypedDate(plusDays(today, toSunday)), time: '07:00' });
  }
  return out;
}

/** A poll's closing: in 1, 3 or 7 days, at 21:00. */
export function pollCloseTimes(today: string): QuickTime[] {
  return [1, 3, 7].map((count) => ({
    key: `in${count}`,
    label: { kind: 'inDays', count },
    date: formatTypedDate(plusDays(today, count)),
    time: '21:00',
  }));
}

/** An event's day: this Sunday (today when it is Sunday) and the Sunday after. */
export function eventDates(today: string): QuickTime[] {
  const thisSunday = weekday(today) === 0 ? 0 : daysToNextSunday(today);
  return [
    { key: 'thisSunday', label: { kind: 'thisSunday' }, date: formatTypedDate(plusDays(today, thisSunday)) },
    { key: 'nextSunday', label: { kind: 'nextSunday' }, date: formatTypedDate(plusDays(today, thisSunday + 7)) },
  ];
}
