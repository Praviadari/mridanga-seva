// The sending part of notify-parents, kept apart from Deno so plain Node can test it
// (supabase/tests/parent-notices.test.mjs, and smoke-test.mjs against the real queue SQL).
//
// One run: claim_parent_notices() → one email per row through Brevo's transactional API (or, in a
// dry run, a "would send" log line) → finish_parent_notices() records each row as sent, skipped,
// to try again later, or refused. Logs ids, kinds, languages and counts only: never an address,
// a name or a text.

import { buildEmail, languageOf, type Email, type NoticeRow } from './template.ts';

export type Rpc = (name: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;

/** What became of one email. */
export type MailResult = { status: 'sent' } | { status: 'retry'; code: string; stopRun?: boolean } | { status: 'refused'; code: string };

/** Sends one email; null = dry run (no Brevo key or no sender). */
export type Mailer = (to: string, email: Email, stopUrl: string | null) => Promise<MailResult>;

/** How many rows one run claims (claim_parent_notices takes at most 100). */
export const CLAIM_LIMIT = 50;
export const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';

/**
 * Brevo's transactional email call. 201 = accepted. 429 and 5xx (and a network failure) are tried
 * again later; 401/403 (a wrong or blocked key) too, and the run stops, since every other row would
 * fail the same way; any other answer (400: unverified sender, bad address) refuses the row.
 */
export function brevoMailer(
  fetcher: typeof fetch,
  apiKey: string,
  sender: { email: string; name: string },
  replyTo: string | null,
): Mailer {
  return async (to, email, stopUrl) => {
    const headers: Record<string, string> = {};
    if (stopUrl) {
      // RFC 8058 one-click unsubscribe: mail apps POST to the link; a link scanner's GET does nothing.
      headers['List-Unsubscribe'] = `<${stopUrl}>`;
      headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
    }
    let response: Response;
    try {
      response = await fetcher(BREVO_URL, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'api-key': apiKey },
        body: JSON.stringify({
          sender,
          to: [{ email: to }],
          ...(replyTo ? { replyTo: { email: replyTo } } : {}),
          subject: email.subject,
          textContent: email.text,
          htmlContent: email.html,
          ...(stopUrl ? { headers } : {}),
          tags: ['parent-notice'],
        }),
      });
    } catch {
      return { status: 'retry', code: 'network' };
    }
    if (response.status === 201 || response.status === 200) return { status: 'sent' };
    if (response.status === 401 || response.status === 403) return { status: 'retry', code: `brevo_${response.status}`, stopRun: true };
    if (response.status === 429 || response.status >= 500) return { status: 'retry', code: `brevo_${response.status}` };
    return { status: 'refused', code: `brevo_${response.status}` };
  };
}

/** Base64url without padding. */
function base64url(bytes: Uint8Array): string {
  let text = '';
  for (const b of bytes) text += String.fromCharCode(b);
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** The signature of a guardian's unsubscribe link: HMAC-SHA256 of "parent-notice-stop:<id>". */
export async function stopSignature(secret: string, guardianId: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`parent-notice-stop:${guardianId}`));
  return base64url(new Uint8Array(mac));
}

/** The one-click unsubscribe address for a guardian. */
export async function stopUrl(functionUrl: string, secret: string, guardianId: string): Promise<string> {
  return `${functionUrl}?stop=${guardianId}.${await stopSignature(secret, guardianId)}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The guardian id of a correctly signed ?stop= value, else null. Compared in constant time. */
export async function checkStop(secret: string, value: string | null): Promise<string | null> {
  const [id, signature] = (value ?? '').split('.');
  if (!id || !signature || !UUID.test(id)) return null;
  const expected = await stopSignature(secret, id.toLowerCase());
  let difference = expected.length ^ signature.length;
  for (let i = 0; i < Math.max(expected.length, signature.length); i++) {
    difference |= (expected.charCodeAt(i) || 0) ^ (signature.charCodeAt(i) || 0);
  }
  return difference === 0 ? id.toLowerCase() : null;
}

export type RunSummary = {
  dryRun: boolean;
  claimed: number;
  sent: number;
  skipped: number;
  retry: number;
  refused: number;
  /** Count per refusal / retry code. */
  codes: Record<string, number>;
};

/**
 * One run. `mailer` null = dry run: each row is logged as "would send" and finished as skipped.
 * `linkFor` makes the unsubscribe link of a guardian (null = none).
 */
export async function runNotices(
  rpc: Rpc,
  mailer: Mailer | null,
  linkFor: (guardianId: string) => Promise<string | null>,
  log: (...parts: unknown[]) => void = console.log,
): Promise<RunSummary | { error: string }> {
  const claimed = await rpc('claim_parent_notices', { p_limit: CLAIM_LIMIT });
  if (claimed.error) {
    log('claim_parent_notices failed', claimed.error.message);
    return { error: 'claim_failed' };
  }
  const rows = (claimed.data ?? []) as NoticeRow[];
  const summary: RunSummary = { dryRun: mailer === null, claimed: rows.length, sent: 0, skipped: 0, retry: 0, refused: 0, codes: {} };
  if (rows.length === 0) return summary;

  const sent: number[] = [];
  const skipped: number[] = [];
  const retry: number[] = [];
  const refused: Record<string, string> = {};
  let stopped = false;
  for (const row of rows) {
    if (stopped) {
      retry.push(row.notice_id);
      continue;
    }
    const email = buildEmail(row);
    if (!mailer) {
      log('would send', row.notice_id, row.kind, languageOf(row.language));
      skipped.push(row.notice_id);
      continue;
    }
    const result = await mailer(row.email, email, await linkFor(row.guardian_id));
    if (result.status === 'sent') sent.push(row.notice_id);
    else {
      summary.codes[result.code] = (summary.codes[result.code] ?? 0) + 1;
      if (result.status === 'retry') {
        retry.push(row.notice_id);
        if (result.stopRun) stopped = true;
      } else refused[String(row.notice_id)] = result.code;
    }
  }
  summary.sent = sent.length;
  summary.skipped = skipped.length;
  summary.retry = retry.length;
  summary.refused = Object.keys(refused).length;

  const finished = await rpc('finish_parent_notices', {
    p_claim: rows[0].claim,
    p_sent: sent,
    p_skipped: skipped,
    p_retry: retry,
    p_refused: refused,
    p_summary: summary,
  });
  if (finished.error) {
    // The rows' lease ends in 5 minutes and they are claimed again; Brevo may then send a second copy.
    log('finish_parent_notices failed', finished.error.message);
    return { error: 'finish_failed' };
  }
  log('parent notices', JSON.stringify(summary));
  return summary;
}
