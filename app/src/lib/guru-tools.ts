// The rules of the Guru's week-1 tools (audit R3-01, R3-02, R3-05; docs/DECISIONS.md #302): who can be
// picked as a mentor, what a "Set level" change sends, typing a person's name before "Make a coordinator",
// and finding a person among the many waiting sign-ups. Pure functions, unit-tested
// (tests/launch-week-app.test.mjs); the screens are components/guru-student-tools.tsx and
// staff/coordinators/.

import { parseDayMonthYear } from './dates';
import { searchFold } from './search-text';

/** A staff member as the mentor picker needs one. */
export type MentorCandidate = { id: string; fullName: string; role: 'guru' | 'coordinator'; active: boolean };

/**
 * The people a student can be given as mentor: active coordinators and the Guru (the database refuses
 * anyone else, mentor_not_staff), by name, without the mentor the student has now, and never the student's own login:
 * a coordinator's own record needs another coordinator as mentor (0061, own_mentor, docs/DECISIONS.md #319).
 */
export function mentorChoices<T extends MentorCandidate>(
  staff: readonly T[],
  currentMentorId: string | null,
  ownLoginId: string | null = null,
): T[] {
  return staff
    .filter((s) => s.active && s.id !== currentMentorId && s.id !== ownLoginId)
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}

/** What "Set level" writes to the student record: only what changed. */
export type LevelPatch = { level_id?: number; joined_on?: string };

/**
 * The change "Set level" sends, 'badDate' when the typed joining date is not a date or lies in the
 * future, or null when nothing changed.
 * @param current the record's level and joining date ('YYYY-MM-DD').
 * @param levelId the level picked.
 * @param joinedText the joining date as typed (day-month-year); empty keeps the record's date.
 * @param today 'YYYY-MM-DD' of today in the class's time zone.
 */
export function levelPatch(
  current: { levelId: number; joinedOn: string },
  levelId: number,
  joinedText: string,
  today: string,
): LevelPatch | 'badDate' | null {
  const patch: LevelPatch = {};
  if (levelId !== current.levelId) patch.level_id = levelId;
  if (joinedText.trim() !== '') {
    const joined = parseDayMonthYear(joinedText);
    if (joined === null || joined > today || joined < '1900-01-01') return 'badDate';
    if (joined !== current.joinedOn) patch.joined_on = joined;
  }
  return Object.keys(patch).length > 0 ? patch : null;
}

/**
 * True when what the Guru typed is the person's name (or, without a name, their email), ignoring case,
 * accents and extra spaces: "Make a coordinator" is enabled only then, because the role shows every
 * child's record and the app cannot take it back (R3-05).
 */
export function nameTypedRight(typed: string, expected: string): boolean {
  const want = searchFold(expected);
  return want !== '' && searchFold(typed) === want;
}

/** Fewest letters typed before the waiting sign-ups are listed (R3-05). */
export const MIN_WAITING_SEARCH = 2;

/** A login waiting for a role, as the search needs it. */
export type WaitingPerson = { fullName: string; email: string | null; phone: string | null };

/**
 * The waiting logins that match the Guru's search by name, email or phone digits; none until at least
 * MIN_WAITING_SEARCH characters are typed. Since 0046 every adult sign-up waits here until the desk
 * accepts it, so the list is a search, not the whole queue.
 */
export function findWaitingPeople<T extends WaitingPerson>(people: readonly T[], query: string): T[] {
  const q = searchFold(query);
  if (q.length < MIN_WAITING_SEARCH) return [];
  const digits = q.replace(/[\s+()-]/g, '');
  const byPhone = /^\d{3,}$/.test(digits);
  return people.filter(
    (p) =>
      searchFold(p.fullName).includes(q) ||
      searchFold(p.email ?? '').includes(q) ||
      (byPhone && (p.phone ?? '').replace(/\D/g, '').includes(digits)),
  );
}
