// Tells the sign-in screen why it opened when the person did not sign out themselves (D6-20): the
// server ended the login (its refresh token was revoked or expired, the password was changed on
// another device). Without this a coordinator in the middle of a form lands on sign-in with no clue.
// The long forms open at that moment are kept for the same login (src/lib/form-drafts.ts).

import { keepOpenDrafts } from '@/lib/form-drafts';

/** True while the person's own Sign out runs, so its SIGNED_OUT event is not taken for the server's. */
let ownSignOut = false;
/** True after a sign-out the person did not ask for, until the sign-in screen has shown it. */
let ended = false;

/** Marks the start (true) and end (false) of the person's own Sign out (src/auth/auth-actions.ts). */
export function markOwnSignOut(running: boolean): void {
  ownSignOut = running;
}

/** Called by the auth provider on every SIGNED_OUT event. */
export function noteSignedOut(): void {
  if (ownSignOut) return;
  ended = true;
  // Still on screen at this moment: the forms unmount only when the area changes.
  keepOpenDrafts();
}

/** True when the last sign-out was not the person's own. */
export function sessionEnded(): boolean {
  return ended;
}

/** Forgets it, once the sign-in screen has shown it, so it shows only once. */
export function clearSessionEnded(): void {
  ended = false;
}
