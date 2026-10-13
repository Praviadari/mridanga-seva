// What My QR says above the card about today's visit (audit phase 5 U2-02, docs/DECISIONS.md #342): not checked
// in yet today, checked in at 16:05, or checked out (today's visit began at 16:05). From student_home()'s
// here_now and last_visit_at (src/data/home.ts); pure, so it is tested without a phone.

/** Today's state at the door. `at` is the ISO time of today's last check-in. */
export type DoorStatus = { kind: 'none' } | { kind: 'in'; at: string } | { kind: 'out'; at: string };

/**
 * @param hereNow the student is checked in now (an open visit).
 * @param lastVisitAt ISO time of the last check-in, or null.
 * @param today 'YYYY-MM-DD' at the class.
 * @param dayOf turns an ISO time into 'YYYY-MM-DD' at the class (lib/dates localDate).
 */
export function doorStatus(hereNow: boolean, lastVisitAt: string | null, today: string, dayOf: (iso: string) => string): DoorStatus {
  if (hereNow && lastVisitAt) return { kind: 'in', at: lastVisitAt };
  if (lastVisitAt && dayOf(lastVisitAt) === today) return { kind: 'out', at: lastVisitAt };
  return { kind: 'none' };
}

/** How often My QR asks again while it is in view, and for how long at most. */
export const DOOR_POLL_MS = 5_000;
export const DOOR_POLL_FOR_MS = 10 * 60_000;
