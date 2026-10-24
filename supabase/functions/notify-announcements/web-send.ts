// The browser part of the notify-announcements Edge Function (migration 0062, docs/DECISIONS.md #599-#602), kept
// free of Deno and Supabase code like ./send.ts, so supabase/tests runs it with plain Node against the real SQL.
//
// One run, after the phone part: claim_web_push() hands over the waiting browser rows → one encrypted message per
// browser to its push service (./webpush.ts), a few at a time → finish_web_push() records each row:
//   sent      the push service took it (201, or another 2xx);
//   retry     it could not now: no answer, a timeout, 429, 5xx, or 401/403 (the site's VAPID keys refused: fixed by
//             setting the right secrets; after 5 tries the row is given up);
//   refused   never tried again: endpoint_gone (404/410, and the address is deleted), MessageTooBig (413), any other
//             4xx, or a screen the app does not open (bad_url).
// The message holds the title, the short text and the screen to open, the same as the phone's (#602).

import { noticeScreenAllowed, screenFor, shortBody } from './messages.ts';
import { encryptFor, type Subscription, type Vapid, vapidHeader } from './webpush.ts';

/** One row from claim_web_push(): one browser to notify. announcement_id or url is set. */
export type WebRow = {
  claim: string;
  message_id: number;
  announcement_id: number | null;
  title: string;
  body: string;
  endpoint: string;
  p256dh: string;
  auth_secret: string;
  role: string | null;
  url: string | null;
};

/** What the service worker (app/scripts/service-worker.js, 'push') reads. */
export type WebPayload = { title: string; body: string; url: string; tag: string };

/** A message ready to encrypt and send, with the queue row it answers for. */
export type WebItem = { id: number; subscription: Subscription; payload: WebPayload };

/** How one push service answered one message. */
export type WebResult = { kind: 'sent' } | { kind: 'retry'; code: string } | { kind: 'refused'; code: string };

/** Sends one message to one browser. */
export type WebPost = (item: WebItem) => Promise<WebResult>;

/** How long one push service may take before the message counts as failed (and is tried again later). */
export const WEB_TIMEOUT_MS = 10000;
/** Messages sent at the same time. */
export const WEB_PARALLEL = 10;
/** How long a push service keeps a message for a browser that is off: a day, as the queue (0031). */
export const WEB_TTL_S = 24 * 60 * 60;

/** The payloads; a notice asking for a screen the app does not open is dropped, as for phones. */
export function toWebItems(rows: WebRow[]): { items: WebItem[]; dropped: number[] } {
  const items: WebItem[] = [];
  const dropped: number[] = [];
  for (const row of rows) {
    const subscription = { endpoint: row.endpoint, p256dh: row.p256dh, auth: row.auth_secret };
    if (row.announcement_id !== null) {
      items.push({
        id: row.message_id,
        subscription,
        payload: {
          title: row.title,
          body: shortBody(row.body),
          url: screenFor(row.role ?? '', row.announcement_id),
          tag: `announcement-${row.announcement_id}`,
        },
      });
    } else if (row.url && noticeScreenAllowed(row.url)) {
      items.push({ id: row.message_id, subscription, payload: { title: row.title, body: shortBody(row.body), url: row.url, tag: `notice-${row.message_id}` } });
    } else {
      dropped.push(row.message_id);
    }
  }
  return { items, dropped };
}

/** Sorts a push service's HTTP status into sent / retry / refused (RFC 8030 section 5 and the services' own codes). */
export function resultOf(status: number): WebResult {
  if (status >= 200 && status < 300) return { kind: 'sent' };
  if (status === 404 || status === 410) return { kind: 'refused', code: 'endpoint_gone' };
  if (status === 413) return { kind: 'refused', code: 'MessageTooBig' };
  if (status === 401 || status === 403) return { kind: 'retry', code: 'vapid_refused' };
  if (status === 429 || status >= 500) return { kind: 'retry', code: `http_${status}` };
  return { kind: 'refused', code: `http_${status}` };
}

/**
 * A WebPost that encrypts and sends with `fetchFn`. The push service's answer text is never read or logged: it can
 * name the address.
 */
export function webPost(fetchFn: typeof fetch, vapid: Vapid, timeoutMs = WEB_TIMEOUT_MS): WebPost {
  return async (item) => {
    let body: Uint8Array;
    let authorization: string;
    try {
      body = await encryptFor(item.subscription, new TextEncoder().encode(JSON.stringify(item.payload)));
      authorization = await vapidHeader(vapid, item.subscription.endpoint);
    } catch {
      // Keys the database let through but Web Crypto refuses (not a point on the curve): never sendable.
      return { kind: 'refused', code: 'bad_keys' };
    }
    try {
      const response = await fetchFn(item.subscription.endpoint, {
        method: 'POST',
        headers: {
          Authorization: authorization,
          'Content-Encoding': 'aes128gcm',
          'Content-Type': 'application/octet-stream',
          TTL: String(WEB_TTL_S),
          Urgency: 'high',
        },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
      await response.body?.cancel().catch(() => undefined);
      return resultOf(response.status);
    } catch (failure) {
      const name = (failure as { name?: string } | null)?.name;
      return { kind: 'retry', code: name === 'TimeoutError' ? 'timeout' : 'no_answer' };
    }
  };
}

/** Calls a database function as the Edge Function does; answers like supabase-js's rpc. */
export type Rpc = (name: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;

/** The run's counts, as the function answers and push_status.last_web_run keeps them (no addresses, no text). */
export type WebSummary = { messages: number; sent: number; retry: number; refused: number; errors: Record<string, number> };

/**
 * One run: claim, send, finish. Returns the counts, or an error code if the claim failed. If finish_web_push fails
 * the rows stay claimed and are sent again after the lease, as for phones (docs/DECISIONS.md #113).
 */
export async function runWebPush(rpc: Rpc, post: WebPost, parallel = WEB_PARALLEL): Promise<WebSummary | { error: string }> {
  const claimed = await rpc('claim_web_push');
  if (claimed.error) {
    console.error('claim_web_push failed', claimed.error.message);
    return { error: 'claim_failed' };
  }
  const rows = (claimed.data ?? []) as WebRow[];
  const summary: WebSummary = { messages: rows.length, sent: 0, retry: 0, refused: 0, errors: {} };
  if (rows.length === 0) return summary;

  const { items, dropped } = toWebItems(rows);
  const sent: number[] = [];
  const retry: number[] = [];
  const refused: Record<string, string> = {};
  const count = (code: string) => {
    summary.errors[code] = (summary.errors[code] ?? 0) + 1;
  };
  for (const id of dropped) {
    refused[String(id)] = 'bad_url';
    count('bad_url');
  }
  for (let i = 0; i < items.length; i += parallel) {
    const group = items.slice(i, i + parallel);
    const results = await Promise.all(group.map((item) => post(item)));
    results.forEach((result, j) => {
      const id = group[j].id;
      if (result.kind === 'sent') sent.push(id);
      else if (result.kind === 'retry') {
        retry.push(id);
        count(result.code);
      } else {
        refused[String(id)] = result.code;
        count(result.code);
      }
    });
  }
  Object.assign(summary, { sent: sent.length, retry: retry.length, refused: Object.keys(refused).length });

  const args = { p_claim: rows[0].claim, p_sent: sent, p_retry: retry, p_refused: refused, p_summary: summary };
  let finished = await rpc('finish_web_push', args);
  if (finished.error) finished = await rpc('finish_web_push', args);
  if (finished.error) console.error('finish_web_push failed', finished.error.message);
  if (summary.refused > 0 || summary.retry > 0) console.error('web push run', JSON.stringify(summary));
  return summary;
}
