// Small helpers that turn values stored as numbers or codes into words in the app's language:
// a level's name, a status, a call outcome or reason, when a student last came, a length of time.
// Used by several screens, so the wording is the same everywhere.

import type { TFunction } from 'i18next';

import { isKnownCallReason, type CallOutcome } from '@/data/follow-up';
import type { StudentStatus, StudentSummary } from '@/data/student-overview';
import { dateInIndia, formatDayMonthYear } from '@/lib/dates';

/**
 * The level's name in the app's language. The three levels (Beginner, Intermediate, Advanced)
 * are created by migration 0001 and do not change, so they are translated by id; a level added
 * later shows `fallback` (its name from the database), or the id when no name was loaded.
 */
export function levelName(t: TFunction, levelId: number, fallback?: string): string {
  switch (levelId) {
    case 1:
      return t('levels.1');
    case 2:
      return t('levels.2');
    case 3:
      return t('levels.3');
    default:
      return fallback ?? String(levelId);
  }
}

/** A student's status in the app's language: new, active, irregular, inactive, paused, left. */
export function statusName(t: TFunction, status: StudentStatus): string {
  return t(`statuses.${status}`);
}

/** What came of a follow-up call, in the app's language. */
export function outcomeName(t: TFunction, outcome: CallOutcome): string {
  return t(`callOutcomes.${outcome}`);
}

/**
 * A reason for a call (a code from settings.call_reasons) in the app's language. A reason the
 * Guru added later has no translation yet, so it shows as written (docs/DECISIONS.md #19).
 */
export function callReasonName(t: TFunction, code: string): string {
  return isKnownCallReason(code) ? t(`callReasons.${code}`) : code;
}

/**
 * When the student last came, for lists: "Here now", "Last visit today", "... yesterday",
 * "Last visit 10-09-2026 · 20 days ago", or "No visit yet · joined 22-09-2026".
 */
export function lastVisitText(
  t: TFunction,
  student: Pick<StudentSummary, 'lastVisitAt' | 'daysSinceVisit' | 'joinedOn' | 'hereNow'>,
): string {
  if (student.hereNow) return t('students.hereNow');
  if (!student.lastVisitAt) return t('students.neverVisited', { date: formatDayMonthYear(student.joinedOn) });
  if (student.daysSinceVisit === 0) return t('students.lastVisitToday');
  if (student.daysSinceVisit === 1) return t('students.lastVisitYesterday');
  return t('students.lastVisit', {
    date: formatDayMonthYear(dateInIndia(student.lastVisitAt)),
    days: student.daysSinceVisit,
  });
}

/** A length of time given in whole minutes, e.g. 105 → "1 h 45 min", 40 → "40 min". */
export function formatDuration(t: TFunction, totalMinutes: number): string {
  const minutes = Math.max(0, Math.round(totalMinutes));
  if (minutes < 60) return t('time.minutes', { minutes });
  return t('time.hoursMinutes', { hours: Math.floor(minutes / 60), minutes: minutes % 60 });
}
