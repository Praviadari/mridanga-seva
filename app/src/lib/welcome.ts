// The welcome card on the student home (audit phase 5 U2-04, docs/DECISIONS.md #342): shown once on this phone
// for a login that has just become a student, so the person knows the account is ready and what to show at
// the door. "Just" = joined in the last 30 days, so students who joined long ago do not get it after an update.
// Remembered per login on the device (lib/local-storage.ts), like the About-you prompt is per login.

import { readLocal, writeLocal } from './local-storage';

/** A student who joined this many days ago or less still gets the welcome once. */
export const WELCOME_WITHIN_DAYS = 30;

const keyFor = (profileId: string) => `welcome-seen:${profileId}`;

/** Whole days from `from` to `to`, both 'YYYY-MM-DD'. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** True when the welcome is due: not seen on this phone, and joined within WELCOME_WITHIN_DAYS of today. */
export function welcomeDue(seen: boolean, joinedOn: string, today: string): boolean {
  const days = daysBetween(joinedOn, today);
  return !seen && days >= 0 && days <= WELCOME_WITHIN_DAYS;
}

/** True when this login already saw the welcome on this phone. */
export function welcomeSeen(profileId: string): boolean {
  return readLocal(keyFor(profileId)) !== null;
}

/** Remembers that this login saw the welcome on this phone. */
export function markWelcomeSeen(profileId: string): void {
  writeLocal(keyFor(profileId), new Date().toISOString());
}
