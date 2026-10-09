// Small helpers that turn values stored as numbers or codes into words in the app's language:
// a level's name, a guardian's relation, an ID type, a status, a call outcome or reason, when a student last came, who an
// announcement is for, a file's size, a length of time.
// Used by several screens, so the wording is the same everywhere.

import type { TFunction } from 'i18next';

import type { Announcement } from '@/data/announcements';
import { isKnownCallReason, type CallOutcome } from '@/data/follow-up';
import type { StudentStatus, StudentSummary } from '@/data/student-overview';
import { ID_TYPES, RELATIONS, type IdType, type Relation } from '@/data/students';
import { localDate, formatDate } from '@/lib/dates';

/**
 * The level ids, in order: the three levels of migration 0001, which do not change (Praveen's
 * decision of 28-09-2026). Every level choice and filter offers these; adding a level means adding
 * it here and in levelName.
 */
export const LEVEL_IDS = [1, 2, 3] as const;

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

/**
 * A guardian's relation (mother, father, guardian) in the app's language. A code the app does not
 * know, or none, shows `fallback`: the code itself unless the screen gives a word.
 */
export function relationName(t: TFunction, code: string | null, fallback: string = code ?? ''): string {
  return code && (RELATIONS as readonly string[]).includes(code) ? t(`relations.${code as Relation}`) : fallback;
}

/** The kind of ID the coordinator checked (Aadhaar, PAN, ...) in the app's language; an unknown code as stored. */
export function idTypeName(t: TFunction, code: string | null): string {
  return code && (ID_TYPES as readonly string[]).includes(code) ? t(`idTypes.${code as IdType}`) : (code ?? '');
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
  if (!student.lastVisitAt) return t('students.neverVisited', { date: formatDate(student.joinedOn) });
  if (student.daysSinceVisit === 0) return t('students.lastVisitToday');
  if (student.daysSinceVisit === 1) return t('students.lastVisitYesterday');
  return t('students.lastVisit', {
    date: formatDate(localDate(student.lastVisitAt)),
    days: student.daysSinceVisit,
  });
}

/**
 * Who an announcement is for, in the app's language: "All students", "Beginner level",
 * "My mentees" / "Mentees of Radha" / "Your mentor's students", "Staff only", "Group: Sunday
 * Harinam". `groupName` is the name of its group; `authorName` and `byMe` word a mentees audience
 * for staff (a student reading it gets "Your mentor's students").
 */
export function audienceName(
  t: TFunction,
  announcement: Pick<Announcement, 'audience' | 'audienceLevel'>,
  names: { groupName?: string | null; authorName?: string | null; byMe?: boolean } = {},
): string {
  switch (announcement.audience) {
    case 'all':
      return t('announcements.audience.all');
    case 'level':
      return t('announcements.audience.level', { level: levelName(t, announcement.audienceLevel ?? 0) });
    case 'mentees':
      if (names.byMe) return t('announcements.audience.myMentees');
      if (names.authorName) return t('announcements.audience.menteesOf', { name: names.authorName });
      return t('announcements.audience.mentees');
    case 'staff':
      return t('announcements.audience.staff');
    case 'group':
      return t('announcements.audience.group', { name: names.groupName ?? '' });
  }
}

/**
 * The "Posted by Radha" line of an announcement card, as a list to spread into the card's
 * details: empty when the author's name is unknown or blank (a login made in the Supabase
 * dashboard has no name), so the card never reads "Posted by " with nothing after it.
 * @param authorName the author's name from staff_names, or undefined when not known.
 */
export function authorLine(t: TFunction, authorName: string | undefined): string[] {
  const name = authorName?.trim();
  return name ? [t('announcements.postedBy', { name })] : [];
}

/** A file's size given in bytes, e.g. 348160 → "340 KB", 1572864 → "1.5 MB". */
export function fileSizeText(t: TFunction, bytes: number): string {
  const kb = bytes / 1024;
  if (kb < 1024) return t('announcements.files.sizeKb', { size: Math.max(1, Math.round(kb)) });
  return t('announcements.files.sizeMb', { size: (kb / 1024).toFixed(1) });
}

/** A length of time given in whole minutes, e.g. 105 → "1 h 45 min", 40 → "40 min". */
export function formatDuration(t: TFunction, totalMinutes: number): string {
  const minutes = Math.max(0, Math.round(totalMinutes));
  if (minutes < 60) return t('time.minutes', { minutes });
  return t('time.hoursMinutes', { hours: Math.floor(minutes / 60), minutes: minutes % 60 });
}

const MONTH_KEYS = [
  'months.m1',
  'months.m2',
  'months.m3',
  'months.m4',
  'months.m5',
  'months.m6',
  'months.m7',
  'months.m8',
  'months.m9',
  'months.m10',
  'months.m11',
  'months.m12',
] as const;

/** A month 'YYYY-MM' as its name and year, e.g. 'October 2026' (S9 Attendance history). */
export function monthName(t: TFunction, month: string): string {
  const [year, number] = month.split('-');
  const key = MONTH_KEYS[Number(number) - 1] ?? MONTH_KEYS[0];
  return t('visitHistory.month', { month: t(key), year });
}
