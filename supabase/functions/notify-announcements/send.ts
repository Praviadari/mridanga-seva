// The sending part of the notify-announcements Edge Function, kept free of Deno and Supabase
// code so supabase/tests can run it with plain Node, against the real SQL in the smoke test.
// ./index.ts only wires it to the database and to fetch. Why: docs/DECISIONS.md #112-#115.
//
// One run: claim_push_queue() (migration 0031) hands over the waiting rows, one per phone →
// messages of at most 100 per request to Expo → each row's outcome goes back with finish_push():
//   sent      Expo accepted it (a ticket "ok", or no ticket for it at all);
//   retry     Expo could not take it now (no answer, 429 or 5xx, timeout, or a ticket error such
//             as InvalidCredentials or MessageRateExceeded): the database tries again later;
//   refused   never tried again: a ticket DeviceNotRegistered (the token is then deleted) or
//             MessageTooBig, a token of another Expo project, a message Expo refuses even alone,
//             or a screen the app does not open (bad_url).
// A request Expo refuses as a whole (400) is split: tokens of other Expo projects are set aside,
// the rest is sent in halves until the message it refuses is alone (D2-01).

import {
  BATCH_SIZE,
  batches,
  toMessages,
  toOutboxMessages,
  type PushMessage,
  type PushTicket,
} from './messages.ts';

/** Expo's push endpoint. */
export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
/** This app's Expo project (app/app.json owner and slug), as Expo names it in its errors. */
export const EXPO_PROJECT = '@mridanga-seva/mridanga-seva';
/** How long one request to Expo may take before it counts as failed (and is tried again later). */
export const REQUEST_TIMEOUT_MS = 15000;
/** Ticket errors that are never tried again; every other ticket error is. */
const FINAL_TICKET_ERRORS = new Set(['DeviceNotRegistered', 'MessageTooBig']);

/** One row from claim_push_queue(): one phone to notify. announcement_id or url is set. */
export type QueuedRow = {
  claim: string;
  message_id: number;
  announcement_id: number | null;
  title: string;
  body: string;
  token: string;
  role: string | null;
  url: string | null;
};

/** A message ready to send, with the queue row it answers for. */
export type Item = { id: number; message: PushMessage };

/** What Expo answered one request. */
export type PostResult =
  | { kind: 'ok'; tickets: PushTicket[] }
  | { kind: 'refused'; status: number; code: string; details?: unknown }
  | { kind: 'failed'; reason: string };

/** Sends one request of messages to Expo. */
export type Post = (messages: PushMessage[]) => Promise<PostResult>;

/** What became of the rows, and counts for the log and push_status (no tokens, no text). */
export type Outcome = {
  sent: number[];
  retry: number[];
  refused: Record<string, string>;
  requests: number;
  failedRequests: number;
  /** How often each Expo error code was seen, e.g. {"DeviceNotRegistered": 1}. */
  errors: Record<string, number>;
};

/**
 * Builds the messages, with the shapes of messages.ts: an announcement row as toMessages, a notice
 * row as toOutboxMessages. A notice asking for a screen the app does not open is dropped.
 */
export function toItems(rows: QueuedRow[]): { items: Item[]; dropped: number[] } {
  const items: Item[] = [];
  const dropped: number[] = [];
  for (const row of rows) {
    const [message] = row.announcement_id !== null
      ? toMessages([{ announcement_id: row.announcement_id, title: row.title, body: row.body, token: row.token, role: row.role ?? '' }])
      : toOutboxMessages([{ outbox_id: row.message_id, title: row.title, body: row.body, url: row.url ?? '', token: row.token }]);
    if (message) items.push({ id: row.message_id, message });
    else dropped.push(row.message_id);
  }
  return { items, dropped };
}

/** Counts one error code. */
function count(outcome: Outcome, code: string): void {
  outcome.errors[code] = (outcome.errors[code] ?? 0) + 1;
}

/**
 * The tokens Expo lists per project in a PUSH_TOO_MANY_EXPERIENCE_IDS refusal
 * ({"@owner/slug": ["ExponentPushToken[...]", ...], ...}), or null if the details are not that.
 */
function tokensByProject(details: unknown): Record<string, string[]> | null {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return null;
  const out: Record<string, string[]> = {};
  for (const [project, tokens] of Object.entries(details as Record<string, unknown>)) {
    if (!Array.isArray(tokens)) return null;
    out[project] = tokens.filter((token): token is string => typeof token === 'string');
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** Sends one request and sorts its rows; a refused request is split and sent again. */
async function sendGroup(items: Item[], post: Post, project: string, outcome: Outcome): Promise<void> {
  if (items.length === 0) return;
  outcome.requests++;
  const result = await post(items.map((item) => item.message));

  if (result.kind === 'failed') {
    outcome.failedRequests++;
    count(outcome, result.reason);
    for (const item of items) outcome.retry.push(item.id);
    return;
  }

  if (result.kind === 'ok') {
    items.forEach((item, i) => {
      const ticket = result.tickets[i];
      if (!ticket || ticket.status !== 'error') {
        outcome.sent.push(item.id);
        return;
      }
      const code = ticket.details?.error ?? 'TicketError';
      count(outcome, code);
      if (FINAL_TICKET_ERRORS.has(code)) outcome.refused[String(item.id)] = code;
      else outcome.retry.push(item.id);
    });
    return;
  }

  outcome.failedRequests++;
  count(outcome, result.code);
  // Tokens of more than one Expo project in one request: send only this project's (Expo names
  // them; if it does not name this project, the project with the most tokens here).
  const groups = result.code === 'PUSH_TOO_MANY_EXPERIENCE_IDS' ? tokensByProject(result.details) : null;
  if (groups) {
    const names = Object.keys(groups);
    const ours = names.includes(project)
      ? project
      : names.reduce((a, b) => (groups[b].length > groups[a].length ? b : a));
    const foreign = new Set(names.filter((name) => name !== ours).flatMap((name) => groups[name]));
    const keep = items.filter((item) => !foreign.has(item.message.to));
    for (const item of items) {
      if (foreign.has(item.message.to)) outcome.refused[String(item.id)] = 'OtherProject';
    }
    if (keep.length < items.length) {
      await sendGroup(keep, post, project, outcome);
      return;
    }
  }
  if (items.length === 1) {
    outcome.refused[String(items[0].id)] = result.code;
    return;
  }
  const half = Math.ceil(items.length / 2);
  await sendGroup(items.slice(0, half), post, project, outcome);
  await sendGroup(items.slice(half), post, project, outcome);
}

/** Sends every item, at most BATCH_SIZE per request, and says what became of each. */
export async function sendAll(items: Item[], post: Post, project = EXPO_PROJECT): Promise<Outcome> {
  const outcome: Outcome = { sent: [], retry: [], refused: {}, requests: 0, failedRequests: 0, errors: {} };
  for (const group of batches(items, BATCH_SIZE)) await sendGroup(group, post, project, outcome);
  return outcome;
}

/**
 * A Post that calls Expo with `fetchFn`. 2xx = tickets; 429, 5xx, no answer or no answer within
 * REQUEST_TIMEOUT_MS = failed (tried again later); any other status = refused, with Expo's error
 * code and details. Expo's answer text is never logged: it can hold tokens (D2-12).
 */
export function expoPost(
  fetchFn: typeof fetch,
  headers: Record<string, string>,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Post {
  return async (messages) => {
    let response: Response;
    try {
      response = await fetchFn(EXPO_PUSH_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(messages),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (failure) {
      const name = (failure as { name?: string } | null)?.name;
      return { kind: 'failed', reason: name === 'TimeoutError' ? 'timeout' : 'no_answer' };
    }
    const answer = (await response.json().catch(() => null)) as
      | { data?: PushTicket[]; errors?: { code?: string; details?: unknown }[] }
      | null;
    if (response.ok) return { kind: 'ok', tickets: Array.isArray(answer?.data) ? answer.data : [] };
    if (response.status === 429 || response.status >= 500) return { kind: 'failed', reason: `http_${response.status}` };
    const error = answer?.errors?.[0];
    return { kind: 'refused', status: response.status, code: error?.code ?? `http_${response.status}`, details: error?.details };
  };
}

/** Calls a database function as the Edge Function does; answers like supabase-js's rpc. */
export type Rpc = (name: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;

/** The run's counts, as the function answers and push_status.last_run keeps them. */
export type Summary = {
  messages: number;
  sent: number;
  retry: number;
  refused: number;
  requests: number;
  failedRequests: number;
  errors: Record<string, number>;
};

/**
 * One run: claim, send, finish. Returns the counts, or an error code if the claim failed. If
 * finish_push fails the rows stay claimed and are sent again after the lease (docs/DECISIONS.md #113).
 */
export async function runPush(rpc: Rpc, post: Post, project = EXPO_PROJECT): Promise<Summary | { error: string }> {
  const claimed = await rpc('claim_push_queue');
  if (claimed.error) {
    console.error('claim_push_queue failed', claimed.error.message);
    return { error: 'claim_failed' };
  }
  const rows = (claimed.data ?? []) as QueuedRow[];
  const summary: Summary = { messages: rows.length, sent: 0, retry: 0, refused: 0, requests: 0, failedRequests: 0, errors: {} };
  if (rows.length === 0) return summary;

  const { items, dropped } = toItems(rows);
  const outcome = await sendAll(items, post, project);
  for (const id of dropped) outcome.refused[String(id)] = 'bad_url';
  if (dropped.length > 0) count(outcome, 'bad_url');
  Object.assign(summary, {
    sent: outcome.sent.length,
    retry: outcome.retry.length,
    refused: Object.keys(outcome.refused).length,
    requests: outcome.requests,
    failedRequests: outcome.failedRequests,
    errors: outcome.errors,
  });

  const args = { p_claim: rows[0].claim, p_sent: outcome.sent, p_retry: outcome.retry, p_refused: outcome.refused, p_summary: summary };
  let finished = await rpc('finish_push', args);
  if (finished.error) finished = await rpc('finish_push', args);
  if (finished.error) console.error('finish_push failed', finished.error.message);
  if (summary.failedRequests > 0 || summary.refused > 0 || summary.retry > 0) {
    console.error('push run', JSON.stringify(summary));
  }
  return summary;
}
