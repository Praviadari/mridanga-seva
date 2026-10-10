// Ends on the server a login that was signed out on this device without internet (D3-07, R2G2-05;
// docs/DECISIONS.md #238, which adds to #42). Sign out without internet can only forget the login on the
// phone; its refresh token stays valid on the server, so a copy taken from the phone before could still be
// used. Sign out therefore keeps that refresh token here as "sign-out pending", and the next time the app is
// online it is used once more to end that login on the server: the refresh token is exchanged for a fresh
// access token, and /logout with it ends the whole login (every refresh token of it). Nothing here touches
// the Supabase client's own session, which by then may be the next person's.

import { readLocal, removeLocal, writeLocal } from '@/lib/local-storage';

/** Where the pending refresh tokens are kept on this device. */
export const PENDING_KEY = 'pendingSignOut';

/** At most this many are kept; older ones are dropped (a shared phone signed out offline again and again). */
const MAX_PENDING = 5;

/** The project and fetch the server calls use; src/lib/supabase.ts gives the app's own. */
export type ServerAccess = { url: string; key: string; fetch: typeof fetch };

/** What became of one pending sign-out: ended (or already invalid), try later, or try later with this new token. */
type Outcome = { done: true } | { done: false; token: string };

/** The refresh tokens waiting to be ended on the server, oldest first. */
export function pendingSignOuts(): string[] {
  const text = readLocal(PENDING_KEY);
  if (!text) return [];
  try {
    const list: unknown = JSON.parse(text);
    return Array.isArray(list) ? list.filter((token): token is string => typeof token === 'string' && token !== '') : [];
  } catch {
    return [];
  }
}

function savePending(tokens: string[]): void {
  if (tokens.length === 0) removeLocal(PENDING_KEY);
  else writeLocal(PENDING_KEY, JSON.stringify(tokens.slice(-MAX_PENDING)));
}

/** Notes a refresh token whose login must be ended on the server at the next chance (Sign out offline). */
export function keepPendingSignOut(refreshToken: string): void {
  const tokens = pendingSignOuts().filter((token) => token !== refreshToken);
  savePending([...tokens, refreshToken]);
}

/** Ends the login of one refresh token on the server. Never throws: a failure means "try later". */
async function endLogin(token: string, server: ServerAccess): Promise<Outcome> {
  const later: Outcome = { done: false, token };
  let access: string;
  let next: string;
  try {
    const refreshed = await server.fetch(`${server.url}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { apikey: server.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: token }),
    });
    // The server refuses a refresh token that is used up, unknown or ended (400, or 401/403): nothing is
    // left to end. Anything else (rate limit, server trouble) waits for the next try.
    if (!refreshed.ok) return refreshed.status === 400 || refreshed.status === 401 || refreshed.status === 403 ? { done: true } : later;
    const body = (await refreshed.json().catch(() => ({}))) as { access_token?: unknown; refresh_token?: unknown };
    if (typeof body.access_token !== 'string') return later;
    access = body.access_token;
    // The exchange used up the old token; if /logout fails below, the new one is what is left to end.
    next = typeof body.refresh_token === 'string' ? body.refresh_token : token;
  } catch {
    return later;
  }
  try {
    const ended = await server.fetch(`${server.url}/auth/v1/logout?scope=local`, {
      method: 'POST',
      headers: { apikey: server.key, Authorization: `Bearer ${access}` },
    });
    // 401, 403 and 404: the login is already gone.
    if (ended.ok || ended.status === 401 || ended.status === 403 || ended.status === 404) return { done: true };
    return { done: false, token: next };
  } catch {
    return { done: false, token: next };
  }
}

let running: Promise<void> | null = null;

/**
 * Ends on the server every login signed out offline on this device, and forgets those that are done.
 * Called when the app starts, comes back to the screen or goes online (src/auth/auth-provider.tsx); does
 * nothing without pending sign-outs, and one run at a time.
 * @param server the project and fetch to use; null (settings missing) does nothing.
 */
export function finishPendingSignOuts(server: ServerAccess | null): Promise<void> {
  if (!server || pendingSignOuts().length === 0) return Promise.resolve();
  running ??= (async () => {
    try {
      for (const token of pendingSignOuts()) {
        const outcome = await endLogin(token, server);
        // Read again after each call: Sign out may have added one meanwhile.
        const rest = pendingSignOuts().filter((kept) => kept !== token);
        savePending(outcome.done ? rest : [...rest, outcome.token]);
        // No internet: the others would fail the same way.
        if (!outcome.done && outcome.token === token) break;
      }
    } finally {
      running = null;
    }
  })();
  return running;
}
