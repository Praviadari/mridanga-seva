// Staff sign-in codes (TOTP; migration 0061, docs/DECISIONS.md #580-#584): the pure rules the auth provider and the
// screens use. Supabase Auth keeps each person's codes as MFA factors; a session that gave the code carries
// aal = 'aal2' in its access token, which the database reads (private_reads_open). Nothing here calls the server:
// src/data/staff-mfa.ts does. Unit-tested in tests/staff-mfa.test.mjs.

import type { MessageKey } from '@/data/errors';

/** Digits in a sign-in code (authenticator apps show six). */
export const CODE_LENGTH = 6;

/** The part of a Supabase session these rules read. */
export type CodeSession = {
  access_token: string;
  user: { factors?: { id: string; status: string; factor_type?: string; created_at?: string }[] | null };
};

/** The aal claim of an access token ('aal1' or 'aal2'), or null when the token cannot be read. */
export function tokenAal(accessToken: string | null | undefined): string | null {
  const payload = accessToken?.split('.')[1];
  if (!payload) return null;
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '=');
    const claims = JSON.parse(atob(base64)) as { aal?: unknown };
    return typeof claims.aal === 'string' ? claims.aal : null;
  } catch {
    return null;
  }
}

/** The confirmed codes of the session's login, newest first. */
function verifiedFactors(session: CodeSession): { id: string; created_at?: string }[] {
  return (session.user.factors ?? [])
    .filter((f) => f.status === 'verified')
    .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
}

/**
 * True when the login has a confirmed sign-in code and this session has not given it yet: the app asks the code
 * before anything else (#581). A token that cannot be read counts as not given.
 */
export function sessionNeedsCode(session: CodeSession | null): boolean {
  if (!session) return false;
  return verifiedFactors(session).length > 0 && tokenAal(session.access_token) !== 'aal2';
}

/** True when this session gave the sign-in code. */
export function sessionGaveCode(session: CodeSession | null): boolean {
  return !!session && tokenAal(session.access_token) === 'aal2';
}

/** The code to ask at sign-in: the newest confirmed one; null when there is none. */
export function codeFactorId(session: CodeSession | null): string | null {
  return session ? (verifiedFactors(session)[0]?.id ?? null) : null;
}

/** What may be typed in the code box: digits only (other scripts' digits read as 0-9), at most six. */
export function typedCode(text: string): string {
  return text
    .replace(/[౦-౯]/g, (d) => String(d.charCodeAt(0) - 0x0c66))
    .replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x0966))
    .replace(/\D/g, '')
    .slice(0, CODE_LENGTH);
}

/** The set-up key in groups of four, easier to type into an authenticator app. */
export function groupedKey(secret: string): string {
  return secret.replace(/(.{4})/g, '$1 ').trim();
}

/** The name an authenticator app shows for a code set up now; unique, so a new phone never clashes with the old one. */
export function factorName(now: Date): string {
  return `Mridanga Seva ${now.toISOString().slice(0, 16).replace('T', ' ')}`;
}

/**
 * The message for a failed sign-in code or set-up, from Supabase Auth's error code (or message, on older servers).
 * A wrong or expired code, too many tries, codes switched off in the project, no internet; else the general one.
 */
export function mfaErrorKey(error: { code?: string; message?: string; status?: number }): MessageKey {
  const code = error.code ?? '';
  const message = error.message ?? '';
  if (code === 'mfa_verification_failed' || code === 'mfa_challenge_expired' || /invalid totp|code.*(invalid|expired)/i.test(message)) {
    return 'signInCode.wrong';
  }
  if (code === 'over_request_rate_limit' || code === 'mfa_verification_rejected' || error.status === 429) return 'signInCode.tooMany';
  if (code.startsWith('mfa_totp_')) return 'signInCode.notEnabled';
  // The code was removed meanwhile (the Guru reset it): signing in again sets up a new one.
  if (code === 'mfa_factor_not_found') return 'signInCode.wasReset';
  if (/Failed to fetch|Network request failed|Load failed|NetworkError/.test(message)) return 'common.networkError';
  return 'common.genericError';
}
