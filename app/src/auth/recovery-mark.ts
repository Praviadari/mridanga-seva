// Remembers on this device that the login came from a password-reset link and has no new password yet (E5,
// docs/DECISIONS.md #660). The link is used up when it signs the person in, and Supabase says PASSWORD_RECOVERY only
// on that first page load: after Back or a reload the same login came back as an ordinary one and opened the
// person's home, still with the old password. With this mark the auth provider keeps them on the new-password
// screen until the password is saved (USER_UPDATED) or they sign out (SIGNED_OUT), on every start in between.
// Kept with the user id, so it never holds back a different login.

import { readLocal, removeLocal, writeLocal } from '@/lib/local-storage';

const KEY = 'passwordRecovery';

/** Marks the login of `userId` as signed in by a reset link, until markRecoveryDone(). */
export function markRecovery(userId: string): void {
  writeLocal(KEY, userId);
}

/** Ends the mark: the new password was saved, or the person signed out. */
export function markRecoveryDone(): void {
  removeLocal(KEY);
}

/** The user id whose login still needs a new password on this device, or null. */
export function recoveryUserId(): string | null {
  return readLocal(KEY);
}

/**
 * True when the login now on this device is the one a reset link signed in: `loginUserId` is the session's user, or
 * while there is no session, the saved login waiting for internet (auth-provider.tsx).
 */
export function isRecoveryLogin(markedUserId: string | null, loginUserId: string | null): boolean {
  return markedUserId !== null && markedUserId === loginUserId;
}
