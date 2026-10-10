// Supabase Edge Function notify-parents: emails a minor's parent when the student is checked in
// or out (migration 0043, docs/DECISIONS.md #224-#231). Called every minute, only when a notice
// waits, by the database job send_parent_notices() through pg_net, with the push secret.
//
// Two kinds of call:
//   - the job (header x-push-secret): claim the waiting rows, send each through Brevo, record each
//     (./send.ts). Without the secrets BREVO_API_KEY and NOTICE_FROM (or with
//     PARENT_NOTICES_DRY_RUN=1) it is a dry run: it logs "would send <row> <kind> <language>" and
//     marks the rows skipped, so the queue can be checked on TEST before any email goes.
//   - a mail app's one-click unsubscribe (RFC 8058): POST ?stop=<guardian id>.<signature>. The
//     signature is an HMAC of the guardian id with the push secret, so only a link from one of our
//     emails works; that guardian gets no more notices (stop_parent_notices).
//
// Runs with the service role, which bypasses row-level security; that key never leaves Supabase.
// Logs ids and counts only, never an address, a name or a text.
// Deploy and settings: docs/OPERATIONS.md "Parent notices by email".

// An exact version (audit D2-10), the same as notify-announcements.
import { createClient } from 'npm:@supabase/supabase-js@2.117.2';

import { pickServiceKey } from '../notify-announcements/messages.ts';
import { brevoMailer, checkStop, runNotices, stopUrl, type Rpc } from './send.ts';

/** Answers the caller with a small JSON object. */
function reply(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** Compares two texts in the same time whatever they hold, so the secret cannot be guessed by timing. */
function sameText(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let difference = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) difference |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return difference === 0;
}

Deno.serve(async (request) => {
  const secret = Deno.env.get('PUSH_SECRET');
  const url = Deno.env.get('SUPABASE_URL');
  const key = pickServiceKey(Deno.env.get('SUPABASE_SECRET_KEYS'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))?.key;
  if (request.method !== 'POST' || !secret) return reply(401, { error: 'not_allowed' });
  if (!url || !key) return reply(500, { error: 'not_configured' });
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const rpc: Rpc = async (name, args) => {
    const { data, error } = await db.rpc(name, args);
    return { data, error: error ? { message: error.message } : null };
  };

  // One-click unsubscribe from an email.
  const stop = new URL(request.url).searchParams.get('stop');
  if (stop !== null) {
    const guardianId = await checkStop(secret, stop);
    if (!guardianId) return reply(400, { error: 'bad_link' });
    const result = await rpc('stop_parent_notices', { p_guardian: guardianId });
    if (result.error) {
      console.error('stop_parent_notices failed', result.error.message);
      return reply(500, { error: 'stop_failed' });
    }
    console.log('parent notices stopped by one-click unsubscribe');
    return reply(200, { stopped: true });
  }

  // Only the database job knows this secret (Vault mridanga_push_secret = function secret PUSH_SECRET).
  if (!sameText(request.headers.get('x-push-secret') ?? '', secret)) return reply(401, { error: 'not_allowed' });

  const apiKey = Deno.env.get('BREVO_API_KEY');
  const from = Deno.env.get('NOTICE_FROM');
  const dryRun = !apiKey || !from || Deno.env.get('PARENT_NOTICES_DRY_RUN') === '1';
  if (dryRun) console.log('dry run:', !apiKey ? 'no BREVO_API_KEY' : !from ? 'no NOTICE_FROM' : 'PARENT_NOTICES_DRY_RUN=1');
  const mailer = dryRun
    ? null
    : brevoMailer(fetch, apiKey, { email: from, name: Deno.env.get('NOTICE_FROM_NAME') || 'Mridanga Seva' },
        Deno.env.get('NOTICE_REPLY_TO') || null);
  const functionUrl = `${url.replace(/\/$/, '')}/functions/v1/notify-parents`;
  const result = await runNotices(rpc, mailer, (guardianId) => stopUrl(functionUrl, secret, guardianId));
  if ('error' in result) return reply(500, result);
  return reply(200, result);
});
