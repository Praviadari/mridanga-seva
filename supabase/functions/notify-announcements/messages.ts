// The parts of the notify-announcements Edge Function that need no network: turning the rows
// from claim_due_push() into Expo push messages, splitting them into batches, and reading Expo's
// answer. Kept free of Deno and Supabase code so supabase/tests/push-messages.test.mjs can check
// it with plain Node. The Edge Function itself is ./index.ts; docs/DATABASE.md "Push notifications".

/** One row from claim_due_push() (migration 0011): one phone to notify about one announcement. */
export type ClaimedRow = {
  announcement_id: number;
  title: string;
  /** The first 180 characters of the announcement's text. */
  body: string;
  /** The phone's Expo push token. */
  token: string;
  /** The person's role: 'guru', 'coordinator' or 'student'. Staff and students open different screens. */
  role: string;
};

/** One message for Expo's push service (docs.expo.dev "Sending notifications with Expo's Push API"). */
export type PushMessage = {
  to: string;
  title: string;
  body: string;
  /** Read by the app when the notification is tapped (app/src/lib/push.ts). */
  data: { url: string; announcementId: number };
  sound: 'default';
  /** The Android notification channel the app creates (app/src/lib/push.ts). */
  channelId: string;
  priority: 'high';
};

/** One answer ("push ticket") per message, in the same order as the messages sent. */
export type PushTicket = {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
};

/** The Android notification channel for announcements; the app creates it with the same id. */
export const CHANNEL_ID = 'announcements';
/** Expo accepts at most 100 messages in one request. */
export const BATCH_SIZE = 100;
/** Longest text shown under the title; the rest is on the announcement's screen. */
export const BODY_LENGTH = 150;

/**
 * The app screen that shows the announcement to a person with this role: staff open the staff
 * screen (with "seen by"), students their own. Must match the routes in app/src/app/.
 */
export function screenFor(role: string, announcementId: number): string {
  return role === 'guru' || role === 'coordinator'
    ? `/staff/announcements/${announcementId}`
    : `/student/announcements/${announcementId}`;
}

/** Shortens the text to BODY_LENGTH characters, ending with "…" when something was cut. */
export function shortBody(text: string): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length <= BODY_LENGTH ? oneLine : `${oneLine.slice(0, BODY_LENGTH - 1).trimEnd()}…`;
}

/**
 * One message per row. The title is the announcement's own title, as its author wrote it (the
 * server cannot know the reader's app language); tapping opens the announcement.
 */
export function toMessages(rows: ClaimedRow[]): PushMessage[] {
  return rows.map((row) => ({
    to: row.token,
    title: row.title,
    body: shortBody(row.body),
    data: { url: screenFor(row.role, row.announcement_id), announcementId: row.announcement_id },
    sound: 'default',
    channelId: CHANNEL_ID,
    priority: 'high',
  }));
}

/** Splits `items` into lists of at most `size`. */
export function batches<T>(items: T[], size = BATCH_SIZE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * The tokens Expo says no longer belong to an installed app (DeviceNotRegistered, e.g. the app
 * was removed): they should be deleted so they are not tried again. `tickets[i]` answers `batch[i]`.
 */
export function unregisteredTokens(batch: PushMessage[], tickets: PushTicket[]): string[] {
  return tickets.flatMap((ticket, i) =>
    ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered' && batch[i] ? [batch[i].to] : [],
  );
}
