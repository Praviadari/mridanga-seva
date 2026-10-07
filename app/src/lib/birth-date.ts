// A date of birth picked as three drop-downs (day, month, year) on the sign-up (A1, docs/DECISIONS.md
// #162): no native date picker until the next APK (docs/I18N.md P6). Pure functions, unit-tested.

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
