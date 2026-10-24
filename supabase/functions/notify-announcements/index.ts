// Supabase Edge Function notify-announcements: sends push notifications to the phones of the
// people a newly published announcement, or a queued notice (assessment, promotion, event, poll,
// fund, roster), is addressed to, and (migration 0062) to the browsers they switched notifications
// on in: the web version, the iPhone home-screen app. Called every minute, only when something is
// waiting, by the database job send_due_push() through pg_net. Browsers: ./web-send.ts, ./webpush.ts.
//
// Steps (since migration 0031, docs/DECISIONS.md #112-#115): check the shared secret →
// claim_push_queue() queues what fell due, one row per phone, and claims the waiting rows → one
// message per row to Expo's push service, 100 per request → finish_push() records each row as
// sent, to try again later, or refused. One bad token no longer stops the others, and a row is
// never sent twice by a retry. The sending itself is ./send.ts (tested in supabase/tests).
//
// When a daily job asks with {"cleanup": true}, it also deletes recordings 30 days past their
// review (migration 0016) and announcement files no announcement lists (migration 0040).
//
// Runs with the service role, which bypasses row-level security; that key never leaves Supabase.
// Logs counts and Expo error codes only, never tokens or texts.
// Deploy and settings: docs/OPERATIONS.md "Push notifications". Why: docs/DECISIONS.md #33.

// An exact version (audit D2-10), the one app/package-lock.json has: a deploy never picks up an
// unreviewed release. Change it on purpose, with the app's, and deploy again.
import { createClient } from 'npm:@supabase/supabase-js@2.117.2';

import { batches, pickServiceKey } from './messages.ts';
import { EXPO_PROJECT, expoPost, runPush, type Rpc } from './send.ts';
import { runWebPush, webPost } from './web-send.ts';
import { type Vapid, vapidFrom } from './webpush.ts';

/** Answers the caller with a small JSON object. */
function reply(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** True once this copy of the function has logged where its key came from. */
let keySourceLogged = false;

/**
 * The project's secret (service role) key, which Supabase gives every Edge Function: the new
 * SUPABASE_SECRET_KEYS list if it has the expected shape, else the older SUPABASE_SERVICE_ROLE_KEY
 * (messages.ts pickServiceKey, D2-16). Logs the variable's name once per start, never the key.
 */
function serviceKey(): string | undefined {
  const picked = pickServiceKey(Deno.env.get('SUPABASE_SECRET_KEYS'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
  if (picked && !keySourceLogged) {
    keySourceLogged = true;
    console.log('service key from', picked.source);
  }
  return picked?.key;
}

/** True once this copy of the function has logged that web push is not set up or its keys are wrong. */
let webKeysLogged = false;

/**
 * The site's VAPID key pair for browsers (0062, docs/DECISIONS.md #605): function secrets WEB_PUSH_PUBLIC_KEY,
 * WEB_PUSH_PRIVATE_KEY and WEB_PUSH_SUBJECT (docs/OPERATIONS.md "Push notifications" part C). Null when they are not
 * set or not a key pair; logged once per start, never the keys.
 */
async function webPushKeys(): Promise<Vapid | null> {
  const publicKey = Deno.env.get('WEB_PUSH_PUBLIC_KEY');
  const privateKey = Deno.env.get('WEB_PUSH_PRIVATE_KEY');
  if (!publicKey || !privateKey) {
    if (!webKeysLogged) console.log('web push not set up');
    webKeysLogged = true;
    return null;
  }
  try {
    return await vapidFrom(publicKey, privateKey, Deno.env.get('WEB_PUSH_SUBJECT') || 'mailto:privacy@mridangaseva.com');
  } catch (error) {
    if (!webKeysLogged) console.error('web push keys refused:', (error as Error).message);
    webKeysLogged = true;
    return null;
  }
}

/** Compares two texts in the same time whatever they hold, so the secret cannot be guessed by timing. */
function sameText(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let difference = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) difference |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return difference === 0;
}

/**
 * Deletes submitted assessment files whose review is more than 30 days old (migration 0016,
 * docs/DECISIONS.md #52): claim_expired_submission_files() marks them and returns the paths; a
 * batch Storage refused is put back for the next day. Returns how many were deleted.
 */
async function removeExpiredFiles(db: ReturnType<typeof createClient>): Promise<number> {
  const { data, error } = await db.rpc('claim_expired_submission_files');
  if (error) {
    console.error('claim_expired_submission_files failed', error.message);
    return 0;
  }
  const rows = (data ?? []) as { submission_id: number; path: string }[];
  let removed = 0;
  for (const batch of batches(rows)) {
    const result = await db.storage.from('assessment-files').remove(batch.map((row) => row.path));
    if (result.error) {
      console.error('removing expired files failed', result.error.message);
      await db.rpc('release_submission_files', { p_ids: batch.map((row) => row.submission_id) });
    } else {
      removed += batch.length;
    }
  }
  return removed;
}

/**
 * Deletes announcement files that no announcement lists, over a day old, at most 100 a day
 * (migration 0040, docs/DECISIONS.md #195). A batch Storage refused stays for the next day; before
 * 0040 runs the list does not exist and nothing is deleted. Returns how many were deleted.
 */
async function removeOrphanFiles(db: ReturnType<typeof createClient>): Promise<number> {
  const { data, error } = await db.rpc('orphan_announcement_files');
  if (error) {
    console.error('orphan_announcement_files failed', error.message);
    return 0;
  }
  const paths = (data ?? []) as string[];
  let removed = 0;
  for (const batch of batches(paths)) {
    const result = await db.storage.from('announcement-files').remove(batch);
    if (result.error) console.error('removing orphan files failed', result.error.message);
    else removed += batch.length;
  }
  return removed;
}

Deno.serve(async (request) => {
  // Only the database job knows this secret (Vault mridanga_push_secret = function secret PUSH_SECRET).
  const secret = Deno.env.get('PUSH_SECRET');
  if (request.method !== 'POST' || !secret || !sameText(request.headers.get('x-push-secret') ?? '', secret)) {
    return reply(401, { error: 'not_allowed' });
  }
  const url = Deno.env.get('SUPABASE_URL');
  const key = serviceKey();
  if (!url || !key) return reply(500, { error: 'not_configured' });
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  // A daily job asks for {"cleanup": true}: delete submitted assessment files past their keep time
  // and announcement files no announcement lists.
  const requestBody = (await request.json().catch(() => ({}))) as { cleanup?: boolean };
  const cleaned = requestBody.cleanup ? (await removeExpiredFiles(db)) + (await removeOrphanFiles(db)) : 0;

  // An access token is needed only if "enhanced push security" is switched on for the Expo account.
  const accessToken = Deno.env.get('EXPO_ACCESS_TOKEN');
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Accept-Encoding': 'gzip, deflate',
    'Content-Type': 'application/json',
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };

  const rpc: Rpc = async (name, args) => {
    const { data, error } = await db.rpc(name, args);
    return { data, error: error ? { message: error.message } : null };
  };
  const result = await runPush(rpc, expoPost(fetch, headers), Deno.env.get('EXPO_PROJECT') || EXPO_PROJECT);
  // Browsers (0062): after the phones, whose claim also queues the browser rows. Not set up = nothing claimed; the
  // rows wait and are given up after a day.
  const vapid = await webPushKeys();
  const web = vapid ? await runWebPush(rpc, webPost(fetch, vapid)) : 'not_set_up';
  if ('error' in result) return reply(500, { error: result.error, web, removedFiles: cleaned });
  return reply(200, { ...result, web, removedFiles: cleaned });
});
