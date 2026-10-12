// A date of birth: picked on the phone's calendar (Android) or as three drop-downs (day, month, year)
// on the web (docs/DECISIONS.md #162, #270; components/birth-date-field.tsx). Used by the sign-up and by
// Register a student. Pure functions, unit-tested.

import { ageOn, isMinorOn, parseDayMonthYear, todayLocal } from './dates';

/** The three choices; null while not picked. Month 1-12. */
export type BirthParts = { day: number | null; month: number | null; year: number | null };

export const NO_BIRTH_PARTS: BirthParts = { day: null, month: null, year: null };

/** Oldest age offered in the year list. */
const OLDEST = 100;

/** The years to offer, newest first: this year back to 100 years ago. */
export function birthYears(today: string = todayLocal()): number[] {
  const year = Number(today.slice(0, 4));
  return Array.from({ length: OLDEST + 1 }, (_, i) => year - i);
}

/** The date as 'YYYY-MM-DD', or null while a part is missing or the day does not exist (31 April). */
export function birthDateOf(parts: BirthParts): string | null {
  if (parts.day === null || parts.month === null || parts.year === null) return null;
  return parseDayMonthYear(`${parts.day}-${parts.month}-${parts.year}`);
}

/** The parts of a stored 'YYYY-MM-DD' date, for a form opened again. */
export function partsOf(isoDate: string | null | undefined): BirthParts {
  const match = isoDate ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate) : null;
  return match ? { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) } : NO_BIRTH_PARTS;
}

/**
 * What the sign-up needs to know about the picked date: 'missing' (a part not picked), 'invalid'
 * (no such day, in the future, or over 100 years ago), 'minor' (under 18: sign-up happens at the
 * desk, #150) or 'adult'.
 */
export function birthCheck(parts: BirthParts, today: string = todayLocal()): 'missing' | 'invalid' | 'minor' | 'adult' {
  if (parts.day === null || parts.month === null || parts.year === null) return 'missing';
  const iso = birthDateOf(parts);
  if (!iso || iso > today || ageOn(iso, today) > OLDEST) return 'invalid';
  return isMinorOn(iso, today) ? 'minor' : 'adult';
}

/** The calendar's limits and where it opens: today, 100 years ago, and startAge years ago when nothing is picked. */
export function pickerRange(startAge: number, today: string = todayLocal()): { min: BirthParts; max: BirthParts; start: BirthParts } {
  const [year, month, day] = today.split('-').map(Number);
  // 29 February in a year without it opens on 28 February.
  const sameDay = (y: number): BirthParts => ({ year: y, month, day: month === 2 && day === 29 && !isLeap(y) ? 28 : day });
  return { min: sameDay(year - OLDEST), max: sameDay(year), start: sameDay(year - startAge) };
}

function isLeap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** The parts as a typed date for a form that keeps text ('15-6-2012'); missing parts stay empty ('-6-2012'). */
export function typedOfParts(parts: BirthParts): string {
  if (parts.day === null && parts.month === null && parts.year === null) return '';
  return [parts.day, parts.month, parts.year].map((p) => (p === null ? '' : String(p))).join('-');
}

/** The parts of a typed date (day-month-year or YYYY-MM-DD; empty parts allowed), for the date field. */
export function partsOfTyped(text: string): BirthParts {
  const iso = parseDayMonthYear(text);
  if (iso) return partsOf(iso);
  const match = /^\s*(\d{0,2})-(\d{0,2})-(\d{0,4})\s*$/.exec(text);
  const part = (p: string | undefined) => (p ? Number(p) : null);
  return match ? { day: part(match[1]), month: part(match[2]), year: part(match[3]) } : NO_BIRTH_PARTS;
}
