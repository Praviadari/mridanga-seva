// Where the signed-in person's own student screens live (docs/DECISIONS.md #319): a student's under /student, and
// a coordinator's or the Guru's own student record (migration 0061, #316) under Me in the staff app, /staff/me.
// The student screens (My QR, My progress, My attendance, practice and its log) are shown by both routes, so they
// ask this which home "Back to home" leads to and which practice log they open. Pure, unit-tested
// (tests/staff-own-record.test.mjs).

/** The area of the own student screens: 'student' (a student's app) or 'me' (Me in the staff app). */
export type OwnArea = 'student' | 'me';

/** The own area of a screen from its address (expo-router's usePathname): under /staff it is Me. */
export function ownAreaOf(pathname: string): OwnArea {
  return pathname === '/staff' || pathname.startsWith('/staff/') ? 'me' : 'student';
}
