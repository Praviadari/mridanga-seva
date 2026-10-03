// Supabase Edge Function notify-announcements: sends a push notification to the phones of the
// people a newly published announcement is addressed to. Called every minute, only when an
// announcement is waiting, by the database job send_due_push() (migration 0011) through pg_net.
//
// Steps: check the shared secret → claim_due_push() marks the waiting announcements notified and
// returns one row per phone → one message per phone to Expo's push service, 100 per request →
// tokens Expo no longer knows are deleted. If no request got through at all (for example Expo's
// service was down), the announcements are put back so the next run tries again.
//
// Since migration 0016 it also sends the queued assessment notifications (claim_push_outbox), and
// when the daily job asks with {"cleanup": true}, deletes recordings 30 days past their review.
//
// Runs with the service role, which bypasses row-level security; that key never leaves Supabase.
// Deploy and settings: docs/OPERATIONS.md "Push notifications". Why: docs/DECISIONS.md #33.

import { createClient } from 'npm:@supabase/supabase-js@2';

import {
  batches,
  toMessages,
  toOutboxMessages,
  unregisteredTokens,
  type ClaimedRow,
  type OutboxRow,
  type PushTicket,
} from './messages.ts';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/** Answers the caller with a small JSON object. */
function reply(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/**
 * The project's secret (service role) key, which Supabase gives every Edge Function: the new
 * SUPABASE_SECRET_KEYS list if there is one, else the older SUPABASE_SERVICE_ROLE_KEY.
 */
function serviceKey(): string | undefined {
  const keys = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (keys) {
    try {
      const parsed = JSON.parse(keys) as Record<string, string>;
      const key = parsed.default ?? Object.values(parsed)[0];
      if (key) return key;
    } catch {
      // Fall back to the older variable below.
    }
  }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? undefined;
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

  // The daily job asks for {"cleanup": true}: delete submitted assessment files past their keep time.
  const requestBody = (await request.json().catch(() => ({}))) as { cleanup?: boolean };
  const cleaned = requestBody.cleanup ? await removeExpiredFiles(db) : 0;

  const { data, error } = await db.rpc('claim_due_push');
  if (error) {
    console.error('claim_due_push failed', error.message);
    return reply(500, { error: 'claim_failed' });
  }
  const rows = (data ?? []) as ClaimedRow[];
  // Assessment notifications (migration 0016): already worded per person, with the screen to open.
  const queued = await db.rpc('claim_push_outbox');
  if (queued.error) console.error('claim_push_outbox failed', queued.error.message);
  const outboxRows = (queued.data ?? []) as OutboxRow[];
  const messages = [...toMessages(rows), ...toOutboxMessages(outboxRows)];
  const groups = batches(messages);

  // An access token is needed only if "enhanced push security" is switched on for the Expo account.
  const accessToken = Deno.env.get('EXPO_ACCESS_TOKEN');
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Accept-Encoding': 'gzip, deflate',
    'Content-Type': 'application/json',
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };

  let sent = 0;
  let failedBatches = 0;
  const gone: string[] = [];
  for (const batch of groups) {
    try {
      const response = await fetch(EXPO_PUSH_URL, { method: 'POST', headers, body: JSON.stringify(batch) });
      if (!response.ok) {
        failedBatches++;
        console.error('Expo push request refused', response.status, await response.text());
        continue;
      }
      const tickets = ((await response.json()) as { data?: PushTicket[] }).data ?? [];
      sent += tickets.filter((ticket) => ticket.status === 'ok').length;
      gone.push(...unregisteredTokens(batch, tickets));
      for (const ticket of tickets) {
        if (ticket.status === 'error' && ticket.details?.error !== 'DeviceNotRegistered') {
          // For example InvalidCredentials: the FCM key is missing or wrong (docs/OPERATIONS.md).
          console.error('Expo push ticket error', ticket.details?.error, ticket.message);
        }
      }
    } catch (failure) {
      failedBatches++;
      console.error('Expo push request failed', String(failure));
    }
  }

  const announcementIds = [...new Set(rows.map((row) => row.announcement_id))];
  if (groups.length > 0 && failedBatches === groups.length) {
    // Nothing reached Expo: try again next minute. (When only some batches failed, the others
    // were delivered; trying again would send those people the same notification twice.)
    const released = await db.rpc('release_push_claim', { p_ids: announcementIds });
    if (released.error) console.error('release_push_claim failed', released.error.message);
    const outboxIds = [...new Set(outboxRows.map((row) => row.outbox_id))];
    if (outboxIds.length > 0) {
      const back = await db.rpc('release_push_outbox', { p_ids: outboxIds });
      if (back.error) console.error('release_push_outbox failed', back.error.message);
    }
  }
  if (gone.length > 0) {
    const removed = await db.from('push_tokens').delete().in('token', gone);
    if (removed.error) console.error('removing old tokens failed', removed.error.message);
  }

  return reply(200, {
    announcements: announcementIds.length,
    assessmentNotes: outboxRows.length,
    removedFiles: cleaned,
    messages: messages.length,
    sent,
    failedBatches,
    removedTokens: gone.length,
  });
});
