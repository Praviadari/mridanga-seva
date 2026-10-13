// One integrity check, start to end, with its outside world passed in (the database's two calls,
// Google's decoder, the clock, the pass maker), so plain Node can run it against imitations
// (supabase/tests/integrity-verdict.test.mjs) and smoke-test.mjs against the real SQL.
//
//   1. the request's shape (nothing is spent on a malformed call);
//   2. begin_integrity_check: the challenge is spent, and must be this login's, for this action,
//      not expired; face scan must be on;
//   3. Google decodes the token (decode_failed when it cannot);
//   4. checkVerdict (verdict.ts) with requestHash = SHA-256 of requestText(login, action, challenge,
//      location result);
//   5. finish_integrity_check records 'pass' or the first failed rule; on a pass the phone gets a
//      one-time pass (32 random bytes, base64url) whose SHA-256 the database keeps for 120 s. The
//      future self-scan RPC spends it (use_integrity_pass).
// Logs the result code only: never the token, the pass, the login or the location result.

import { checkVerdict, requestText, sha256Hex, type IntegrityPayload, type VerdictConfig } from './verdict.ts';

export type Rpc = (name: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;

export interface VerifyDeps {
  rpc: Rpc;
  decode: (token: string) => Promise<IntegrityPayload>;
  config: VerdictConfig;
  now: () => number;
  newPass: () => string;
  log?: (line: string) => void;
}

export interface VerifyRequest { profileId: string; body: unknown }
export interface VerifyReply { status: number; body: Record<string, unknown> }

/** 32 random bytes as base64url (43 characters). */
export function randomPass(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const ACTIONS = ['check_in', 'check_out'];

export async function runVerify(request: VerifyRequest, deps: VerifyDeps): Promise<VerifyReply> {
  const log = deps.log ?? ((line: string) => console.log(line));
  const b = (request.body ?? {}) as Record<string, unknown>;
  const challenge = b.challenge;
  const token = b.token;
  const action = b.action;
  const location = b.location;
  if (typeof challenge !== 'string' || !/^[0-9a-f]{32}$/.test(challenge)
      || typeof action !== 'string' || !ACTIONS.includes(action)
      || typeof location !== 'string' || !/^[a-z_]{1,20}$/.test(location)
      || typeof token !== 'string' || token.length === 0 || token.length > 20_000) {
    return { status: 400, body: { ok: false, reason: 'bad_request' } };
  }

  const begun = await deps.rpc('begin_integrity_check',
    { p_challenge: challenge, p_profile: request.profileId, p_action: action, p_location: location });
  if (begun.error) {
    log(`verify-integrity: begin failed ${begun.error.message}`);
    return { status: 500, body: { ok: false, reason: 'server_error' } };
  }
  const start = (begun.data ?? {}) as { ok?: boolean; reason?: string; issued_at_ms?: number | string };
  if (!start.ok) {
    log(`verify-integrity: refused ${start.reason}`);
    return { status: 200, body: { ok: false, reason: start.reason ?? 'refused' } };
  }

  let result: string;
  try {
    const payload = await deps.decode(token);
    const verdict = checkVerdict(payload, {
      ...deps.config,
      expectedHash: await sha256Hex(requestText(request.profileId, action, challenge, location)),
      issuedAtMs: Number(start.issued_at_ms),
      nowMs: deps.now(),
    });
    result = verdict.ok ? 'pass' : (verdict.failed as string);
  } catch {
    result = 'decode_failed';
  }

  const pass = result === 'pass' ? deps.newPass() : null;
  const finished = await deps.rpc('finish_integrity_check',
    { p_challenge: challenge, p_result: result, p_pass_hash: pass ? await sha256Hex(pass) : null });
  if (finished.error) {
    log(`verify-integrity: finish failed ${finished.error.message}`);
    return { status: 500, body: { ok: false, reason: 'server_error' } };
  }
  const end = (finished.data ?? {}) as { ok?: boolean; reason?: string; pass_expires_at?: string };
  log(`verify-integrity: ${end.ok ? result : end.reason}`);
  if (!end.ok) return { status: 200, body: { ok: false, reason: end.reason ?? 'refused' } };
  if (!pass) return { status: 200, body: { ok: false, reason: 'integrity_failed', rule: result } };
  return { status: 200, body: { ok: true, pass, expires_at: end.pass_expires_at } };
}
