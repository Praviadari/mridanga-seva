// Supabase Edge Function notify-announcements: sends a push notification to the phones of the
// people a newly published announcement is addressed to. Called every minute, only when an
// announcement is waiting, by the database job send_due_push() (migration 0011) through pg_net.
//
// Steps: check the shared secret → claim_due_push() marks the waiting announcements notified and
// returns one row per phone → one message per phone to Expo's push service, 100 per request →
// tokens Expo no longer knows are deleted. If no request got through at all (for example Expo's
// service was down), the announcements are put back so the next run tries again.
//
// Runs with the service role, which bypasses row-level security; that key never leaves Supabase.
// Deploy and settings: docs/OPERATIONS.md "Push notifications". Why: docs/DECISIONS.md #33.

import { createClient } from 'npm:@supabase/supabase-js@2';

import { batches, toMessages, unregisteredTokens, type ClaimedRow, type PushTicket } from './messages.ts';

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

  const { data, error } = await db.rpc('claim_due_push');
  if (error) {
    console.error('claim_due_push failed', error.message);
    return reply(500, { error: 'claim_failed' });
  }
  const rows = (data ?? []) as ClaimedRow[];
  const messages = toMessages(rows);
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
  }
  if (gone.length > 0) {
    const removed = await db.from('push_tokens').delete().in('token', gone);
    if (removed.error) console.error('removing old tokens failed', removed.error.message);
  }

  return reply(200, {
    announcements: announcementIds.length,
    messages: messages.length,
    sent,
    failedBatches,
    removedTokens: gone.length,
  });
});
