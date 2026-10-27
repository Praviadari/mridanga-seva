// Supabase Edge Function notify-parents: emails a minor's parent when the student is checked in
// or out (migration 0043, docs/DECISIONS.md #224-#231), the parent of a child who signed up at home the
// code for the consent page (migration 0051, #399; ./consent.ts), and the parents who agreed to it a weekly
// email about their child's week (migration 0058, #530-#539; ./digest.ts). Called by the database jobs
// send_parent_notices() (every minute) and send_parent_digests() (every 5 minutes) through pg_net, with the
// push secret, only when an email waits.
//
// Three kinds of call:
//   - a job (header x-push-secret): the consent emails first (a child waits for them), then the
//     check-in / check-out notices, then the weekly digests: claim the waiting rows, send each through
//     Brevo, record each (./consent.ts, ./send.ts, ./digest.ts). Without the secrets BREVO_API_KEY and
//     NOTICE_FROM (or with PARENT_NOTICES_DRY_RUN=1) it is a dry run: it logs "would send …" and marks the
//     rows skipped, so the queues can be checked on TEST before any email goes.
//   - a mail app's one-click unsubscribe (RFC 8058): POST ?stop=<guardian id>.<signature> stops the
//     check-out emails (stop_parent_notices), ?stop_digest=… the weekly email (stop_parent_digests). The
//     signature is an HMAC of the guardian id and the kind with the push secret, so only a link from one of
//     our emails works, and only for its own kind.
//   - staff's preview of the weekly email (the app, signed in: Authorization: Bearer <the person's token>,
//     body {"preview": "<student id>", "language"?: "en|te|hi", "week"?: "YYYY-MM-DD"}): preview_parent_digest
//     runs AS THAT PERSON (it refuses anyone but staff), and the answer is the email built by the same code
//     that sends it. Nothing is sent. Open to the web app's origin (CORS) for this call only.
//   - the parent page (migration 0063, ./view.ts; no sign-in): body {"view": "<token from the email's link>"}
//     answers parent_view for the guardian the signed, unexpired token names, or {"view": …, "stop": true}
//     stops the weekly email and the page (stop_parent_view). CORS open, as for the preview.
//
// Runs with the service role, which bypasses row-level security; that key never leaves Supabase.
// Logs ids and counts only, never an address, a name or a text.
// Deploy and settings: docs/OPERATIONS.md "Parent notices by email" and "Weekly email to parents".

// An exact version (audit D2-10), the same as notify-announcements.
import { createClient } from 'npm:@supabase/supabase-js@2.117.2';

import { pickServiceKey } from '../notify-announcements/messages.ts';
import { consentPageUrl, runConsentCodes, webAppUrl } from './consent.ts';
import { buildDigestPreview, runDigests, type DigestPreviewData } from './digest.ts';
import { brevoMailer, checkStop, runNotices, STOP_PARAM, stopUrl, type Rpc, type StopKind } from './send.ts';
import { checkView, viewUrl } from './view.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** Answers the caller with a small JSON object. */
function reply(status: number, body: Record<string, unknown>, cors = false): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...(cors ? CORS : {}) } });
}

/** Compares two texts in the same time whatever they hold, so the secret cannot be guessed by timing. */
function sameText(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let difference = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) difference |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return difference === 0;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Staff's preview of the weekly email, run as the signed-in person (the database checks the role). */
async function preview(url: string, authorization: string, body: Record<string, unknown>): Promise<Response> {
  const anon = pickServiceKey(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS'), Deno.env.get('SUPABASE_ANON_KEY'))?.key;
  if (!anon) return reply(500, { error: 'not_configured' }, true);
  const student = typeof body.preview === 'string' && UUID.test(body.preview) ? body.preview : null;
  const language = typeof body.language === 'string' && ['en', 'te', 'hi'].includes(body.language) ? body.language : null;
  const week = typeof body.week === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.week) ? body.week : null;
  if (!student) return reply(400, { error: 'bad_request' }, true);
  const asPerson = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  });
  const { data, error } = await asPerson.rpc('preview_parent_digest', { p_student: student, ...(week ? { p_week: week } : {}) });
  if (error) {
    const code = ['not_allowed', 'student_not_found', 'week_invalid'].includes(error.message) ? error.message : 'preview_failed';
    console.log('digest preview refused', code);
    return reply(code === 'not_allowed' ? 403 : code === 'preview_failed' ? 401 : 400, { error: code }, true);
  }
  console.log('digest preview built');
  return reply(200, buildDigestPreview(data as DigestPreviewData, language), true);
}

/**
 * The parent page (0063): the token's signature and age first, then the database decides (parent_view checks the
 * parent's yes, the consent, the child and the Guru's switch at every opening). Logs outcomes only.
 */
async function parentPage(rpc: Rpc, secret: string, body: Record<string, unknown>): Promise<Response> {
  const guardianId = await checkView(secret, body.view);
  if (guardianId === null) return reply(400, { error: 'bad_link' }, true);
  if (guardianId === 'expired') return reply(200, { result: 'expired' }, true);
  if (body.stop === true) {
    const stopped = await rpc('stop_parent_view', { p_guardian: guardianId });
    if (stopped.error) {
      console.error('stop_parent_view failed', stopped.error.message);
      return reply(500, { error: 'stop_failed' }, true);
    }
    console.log('weekly emails and parent page stopped from the page');
    return reply(200, { result: 'stopped' }, true);
  }
  const page = await rpc('parent_view', { p_guardian: guardianId });
  if (page.error || !page.data || typeof page.data !== 'object') {
    console.error('parent_view failed', page.error?.message ?? 'no data');
    return reply(500, { error: 'view_failed' }, true);
  }
  console.log('parent page', (page.data as { result?: string }).result);
  return reply(200, page.data as Record<string, unknown>, true);
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
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

  // One-click unsubscribe from an email: the check-out emails or the weekly email.
  const params = new URL(request.url).searchParams;
  for (const kind of ['notice', 'digest'] as StopKind[]) {
    const value = params.get(STOP_PARAM[kind]);
    if (value === null) continue;
    const guardianId = await checkStop(secret, value, kind);
    if (!guardianId) return reply(400, { error: 'bad_link' });
    const fn = kind === 'notice' ? 'stop_parent_notices' : 'stop_parent_digests';
    const result = await rpc(fn, { p_guardian: guardianId });
    if (result.error) {
      console.error(`${fn} failed`, result.error.message);
      return reply(500, { error: 'stop_failed' });
    }
    console.log(`${kind === 'notice' ? 'parent notices' : 'weekly emails'} stopped by one-click unsubscribe`);
    return reply(200, { stopped: true });
  }

  // Only the database jobs know this secret (Vault mridanga_push_secret = function secret PUSH_SECRET).
  const pushSecret = request.headers.get('x-push-secret');
  if (pushSecret === null) {
    // No job: the parent page (no sign-in), or staff's preview, signed in.
    const authorization = request.headers.get('Authorization') ?? '';
    const body = await request.json().catch(() => ({}));
    if (body && typeof body === 'object' && 'view' in body) return parentPage(rpc, secret, body as Record<string, unknown>);
    if (/^Bearer \S+$/.test(authorization) && body && typeof body === 'object' && 'preview' in body) {
      return preview(url, authorization, body as Record<string, unknown>);
    }
    return reply(401, { error: 'not_allowed' }, true);
  }
  if (!sameText(pushSecret, secret)) return reply(401, { error: 'not_allowed' });

  const apiKey = Deno.env.get('BREVO_API_KEY');
  const from = Deno.env.get('NOTICE_FROM');
  const dryRun = !apiKey || !from || Deno.env.get('PARENT_NOTICES_DRY_RUN') === '1';
  if (dryRun) console.log('dry run:', !apiKey ? 'no BREVO_API_KEY' : !from ? 'no NOTICE_FROM' : 'PARENT_NOTICES_DRY_RUN=1');
  const sender = { email: from ?? '', name: Deno.env.get('NOTICE_FROM_NAME') || 'Mridanga Seva' };
  const replyTo = Deno.env.get('NOTICE_REPLY_TO') || null;
  const mailer = dryRun ? null : brevoMailer(fetch, apiKey, sender, replyTo);
  // The consent page of this project (APP_WEB_URL, else the web app of the project's ref).
  const appUrl = Deno.env.get('APP_WEB_URL');
  const consent = await runConsentCodes(rpc, mailer, (language) => consentPageUrl(url, appUrl, language));
  const functionUrl = `${url.replace(/\/$/, '')}/functions/v1/notify-parents`;
  const result = await runNotices(rpc, mailer, (guardianId) => stopUrl(functionUrl, secret, guardianId));
  // The parent page's link goes in the weekly email only while the Guru has the page on (0063). Before 0063 the
  // function is missing: no link.
  const viewOn = await rpc('parent_view_on');
  const webApp = webAppUrl(url, appUrl);
  const digests = await runDigests(rpc, dryRun ? null : brevoMailer(fetch, apiKey, sender, replyTo, 'parent-digest'),
    (guardianId) => stopUrl(functionUrl, secret, guardianId, 'digest'), console.log,
    viewOn.data === true ? (guardianId, language) => viewUrl(webApp, secret, guardianId, language) : null);
  if ('error' in result) return reply(500, { ...result, consent, digests });
  if ('error' in consent) return reply(500, { error: consent.error, notices: result, digests });
  if ('error' in digests) return reply(500, { error: digests.error, notices: result, consent });
  return reply(200, { ...result, consent, digests });
});
