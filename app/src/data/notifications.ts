// A2 Notifications inbox: the notices this person was sent, newest first, with the number still
// unread for the bell on the home header. The database fills the inbox (table notifications,
// migration 0015): one row per person per announcement addressed to them, also for people without
// push (the web version, iPhones), so the inbox and the push always agree (docs/DECISIONS.md #49).
// Phase 2's assessment and promotion notices join it from push_outbox (migration 0019, #55).
// Opening an announcement marks its notice read in the database; "Mark all read" marks the notices
// only, so "seen by" on C15 still counts the people who opened the announcement.

import type { Area } from '@/auth/types';
import { belongsTo } from '@/auth/requested-path';
import type { IconName } from '@/components/icon';
import { supabase } from '@/lib/supabase';

/** What a notice is about: an announcement, or a Phase 2 assessment, promotion, event or poll notice. */
export type NoticeKind = 'announcement' | 'assessment' | 'promotion' | 'event' | 'poll' | 'notice';

/** One notice in the inbox. */
export type Notice = {
  id: number;
  kind: NoticeKind;
  title: string;
  /** The start of the text (300 characters at most). */
  body: string;
  /** The screen it opens, the same one the push opens, e.g. /student/announcements/12. */
  url: string;
  /** When it reached the inbox: the publish time of an announcement. */
  visibleAt: string;
  readAt: string | null;
};

/** Notices loaded at first, and added by "Show older". */
export const NOTICES_PER_PAGE = 30;

type Row = { id: number; kind: NoticeKind; title: string; body: string; url: string; visible_at: string; read_at: string | null };

/**
 * Loads the person's notices, newest first, at most `limit` (one more is asked for, to know if
 * there are older ones). Row-level security returns only their own, and only those already due.
 * null = could not be loaded (usually no internet).
 */
export async function fetchInbox(limit: number): Promise<{ notices: Notice[]; hasOlder: boolean } | null> {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, kind, title, body, url, visible_at, read_at')
    .order('visible_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1);
  if (error) return null;
  const rows = data as Row[];
  return {
    notices: rows.slice(0, limit).map((r) => ({
      id: r.id,
      kind: r.kind,
      title: r.title,
      body: r.body,
      url: r.url,
      visibleAt: r.visible_at,
      readAt: r.read_at,
    })),
    hasOlder: rows.length > limit,
  };
}

/** The number of unread notices, for the bell; 0 when it cannot be read (before 0015, offline). */
export async function fetchUnreadCount(): Promise<number> {
  const { data, error } = await supabase.rpc('inbox_unread_count');
  return error || typeof data !== 'number' ? 0 : data;
}

/** Marks the given notices read, or all of them when `ids` is left out. False = it failed. */
export async function markNoticesRead(ids?: number[]): Promise<boolean> {
  const { error } = await supabase.rpc('mark_notifications_read', { p_ids: ids ?? null });
  return !error;
}

/**
 * The screens a push or a notice may open on this version of the app: an announcement, a student's
 * assessment, a recording to review, a nomination, My progress (a promotion), an event or a poll
 * (migration 0022). src/lib/push.ts
 * uses the same list. A notice for a screen this version does not have opens nothing; the inbox
 * says so.
 */
export function isNoticeScreen(url: string): boolean {
  return /^\/(((staff|student)\/(announcements|events|polls)|student\/assessments|staff\/assessments\/review|staff\/promotion)\/\d+|student\/progress)$/.test(url)
    // Team tools (Phase 2 slice 8, staff only): suggestions, the duty roster, one inventory item.
    || /^\/staff\/(suggestions|duty|inventory\/\d+)$/.test(url);
}

/** The screen to open for `notice`, or null when this version cannot open it (or not in this area). */
export function noticeTarget(notice: Notice, area: Area): string | null {
  return isNoticeScreen(notice.url) && belongsTo(notice.url, area) ? notice.url : null;
}

/** The icon of a notice's kind. */
export function noticeIcon(kind: NoticeKind): IconName {
  switch (kind) {
    case 'assessment':
      return 'assessment';
    case 'promotion':
      return 'promote';
    case 'announcement':
      return 'news';
    case 'event':
      return 'events';
    case 'poll':
      return 'poll';
    default:
      return 'bell';
  }
}
