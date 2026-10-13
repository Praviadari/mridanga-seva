// Supabase Edge Function verify-integrity: the server half of Gate 1 (audit S4F-01; migration 0060;
// docs/DECISIONS.md #296). Before a self-scan check-in or check-out, the student's phone:
//   1. asks the database for a challenge (issue_integrity_challenge, 60 s, single use);
//   2. asks Play Integrity for a token whose requestHash is the SHA-256 of
//      'mrdg-selfscan-v1|<login>|<action>|<challenge>|<location result>';
//   3. POSTs { challenge, token, action, location } here with its own sign-in (Authorization).
// This function spends the challenge, has Google decode the token, checks the verdict (verdict.ts)
// and answers { ok: true, pass, expires_at } — a one-time pass for the self-scan RPC, valid 120 s —
// or { ok: false, reason[, rule] }. The web app cannot get a Play Integrity token, so it never gets a
// pass. No CORS headers: browsers are refused on purpose.
//
// Secrets (docs/OPERATIONS.md "Face scan: integrity check"; never in git): GOOGLE_SERVICE_ACCOUNT_JSON
// (the integrity-decoder service account's key), PLAY_INTEGRITY_CERT_SHA256 (the APK signing
// certificate(s)), optionally PLAY_INTEGRITY_PACKAGE and PLAY_INTEGRITY_MIN_VERSION_CODE.
// Runs the database calls with the service role (begin/finish_integrity_check are not open to app
// users). Logs result codes only.

// An exact version (audit D2-10), the same as the other functions.
import { createClient } from 'npm:@supabase/supabase-js@2.117.2';

import { pickServiceKey } from '../notify-announcements/messages.ts';
import { googleDecoder, parseServiceAccount } from './google.ts';
import { randomPass, runVerify, type Rpc } from './run.ts';
import { readConfig, type IntegrityPayload } from './verdict.ts';

// One decoder per function instance, so Google's access token is reused for its hour.
let decoder: ((token: string) => Promise<IntegrityPayload>) | null = null;

/** Answers the caller with a small JSON object. */
function reply(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return reply(405, { ok: false, reason: 'not_allowed' });
  const url = Deno.env.get('SUPABASE_URL');
  const key = pickServiceKey(Deno.env.get('SUPABASE_SECRET_KEYS'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))?.key;
  const config = readConfig((name) => Deno.env.get(name));
  const account = parseServiceAccount(Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON'));
  if (!url || !key || 'error' in config || !account) {
    console.error('verify-integrity: not configured', 'error' in config ? config.error : !account ? 'GOOGLE_SERVICE_ACCOUNT_JSON' : 'Supabase keys');
    return reply(500, { ok: false, reason: 'not_configured' });
  }

  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const jwt = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: who, error: authError } = jwt ? await db.auth.getUser(jwt) : { data: { user: null }, error: null };
  if (authError || !who?.user) return reply(401, { ok: false, reason: 'not_signed_in' });

  const rpc: Rpc = async (name, args) => {
    const { data, error } = await db.rpc(name, args);
    return { data, error: error ? { message: error.message } : null };
  };
  const body = await request.json().catch(() => null);
  const result = await runVerify({ profileId: who.user.id, body }, {
    rpc,
    decode: (decoder ??= googleDecoder(fetch, account, config.packageName)),
    config,
    now: Date.now,
    newPass: randomPass,
  });
  return reply(result.status, result.body);
});
