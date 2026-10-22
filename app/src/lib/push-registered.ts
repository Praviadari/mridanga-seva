// The last push registration that worked on this phone (audit phase 4 P4-05, docs/DECISIONS.md #331): {user,
// token, at}. A start within a week of it, for the same login and the token still kept on the phone, skips
// Expo's token service and register_push_token, two calls at every cold start before. Removed at sign-out, so
// signing in again always registers. Used by src/lib/push.ts.

import { readLocal, removeLocal, writeLocal } from './local-storage';

const REGISTERED_KEY = 'pushRegistered';
/** How long a registration counts as fresh. */
export const REGISTER_AGAIN_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The token registered within the week for `user`, or null.
 * @param keptToken the token the phone keeps for sign-out (push.ts PUSH_TOKEN_KEY); a different one means the
 *   registration is not this phone's current one.
 */
export function recentRegistration(user: string | null, keptToken: string | null, now = Date.now()): string | null {
  if (!user || !keptToken) return null;
  try {
    const saved = JSON.parse(readLocal(REGISTERED_KEY) ?? 'null') as { user?: unknown; token?: unknown; at?: unknown } | null;
    if (!saved || saved.user !== user || saved.token !== keptToken || typeof saved.at !== 'number') return null;
    if (now < saved.at || now - saved.at >= REGISTER_AGAIN_MS) return null;
    return keptToken;
  } catch {
    return null;
  }
}

/** Notes a registration that worked. */
export function rememberRegistration(user: string, token: string, now = Date.now()): void {
  writeLocal(REGISTERED_KEY, JSON.stringify({ user, token, at: now }));
}

/** Forgets it (sign-out). */
export function forgetRegistration(): void {
  removeLocal(REGISTERED_KEY);
}
