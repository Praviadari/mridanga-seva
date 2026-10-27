// The parent page (migration 0063, docs/DECISIONS.md #640-#649): a parent opens it from the link in the weekly email,
// without signing in. The link's token (after '#', never sent in an address) goes to the Edge Function notify-parents in
// a POST body; the function checks its signature and age and asks the database (parent_view), which checks the parent's
// yes, the data consent and the child at every opening. For staff: the Guru's switch and how often it was opened.

import { supabase } from '@/lib/supabase';

import { fallbackErrorKey, type MessageKey } from './errors';

/** A week's visits, as parent_view returns them (week = its Monday, 'YYYY-MM-DD'). */
export type ViewWeek = { week: string; visits: number };
/** A week's practice against the goal. */
export type ViewPracticeWeek = { week: string; minutes: number; days: number; days_met: number };

/** One child's page. Dates are 'YYYY-MM-DD' at the child's centre, times 'HH:MM'. */
export type ParentView = {
  studentName: string;
  /** The email's language as the database knows it (the guardian's, else the child's app language). */
  language: string;
  /** The class desk's phone or email; '' = none given. */
  contact: string;
  centre: string;
  today: string;
  level: number | null;
  levelName: string | null;
  syllabus: { done: number; total: number; next: string[] };
  learnt: { title: string; on: string }[];
  levelChanges: { on: string; from: number | null; to: number; to_name: string }[];
  attendance: { weeks: ViewWeek[]; recent: { on: string; in: string; out: string | null }[] };
  practice: { goal_days: number; goal_minutes: number; streak: number; weeks: ViewPracticeWeek[] };
  events: { title: string; on: string; at: string; centre: string | null }[];
  announcements: { title: string; body: string; on: string }[];
};

/** What opening the page gave: the page, or why there is none. */
export type ParentViewResult =
  | { kind: 'ok'; view: ParentView }
  | { kind: 'switched_off' | 'not_available' | 'expired' | 'bad_link' | 'stopped' }
  | { kind: 'error'; errorKey: MessageKey };

/** The token from the page's address fragment ('#v=<token>'), or null. Only the token's own characters pass. */
export function viewTokenFrom(hash: string | null | undefined): string | null {
  const match = /(?:^#?|&)v=([0-9a-fA-F-]{36}\.\d{9,11}\.[A-Za-z0-9_-]{20,64})(?:&|$)/.exec(hash ?? '');
  return match ? match[1] : null;
}

type Row = {
  result?: string;
  error?: string;
  student_name?: string;
  language?: string;
  contact?: string;
  centre?: string;
  today?: string;
  level?: number | null;
  level_name?: string | null;
  syllabus?: ParentView['syllabus'];
  learnt?: ParentView['learnt'];
  level_changes?: ParentView['levelChanges'];
  attendance?: ParentView['attendance'];
  practice?: ParentView['practice'];
  events?: ParentView['events'];
  announcements?: ParentView['announcements'];
};

/** The answer of notify-parents as a result. */
export function viewResultOf(row: Row | null): ParentViewResult {
  if (!row || typeof row !== 'object') return { kind: 'error', errorKey: 'parentView.loadFailed' };
  if (row.error === 'bad_link') return { kind: 'bad_link' };
  if (row.result === 'switched_off' || row.result === 'not_available' || row.result === 'expired' || row.result === 'stopped') {
    return { kind: row.result };
  }
  if (row.result !== 'ok') return { kind: 'error', errorKey: 'parentView.loadFailed' };
  return {
    kind: 'ok',
    view: {
      studentName: row.student_name ?? '',
      language: row.language ?? 'en',
      contact: row.contact ?? '',
      centre: row.centre ?? '',
      today: row.today ?? '',
      level: row.level ?? null,
      levelName: row.level_name ?? null,
      syllabus: row.syllabus ?? { done: 0, total: 0, next: [] },
      learnt: row.learnt ?? [],
      levelChanges: row.level_changes ?? [],
      attendance: row.attendance ?? { weeks: [], recent: [] },
      practice: row.practice ?? { goal_days: 4, goal_minutes: 15, streak: 0, weeks: [] },
      events: row.events ?? [],
      announcements: row.announcements ?? [],
    },
  };
}

/**
 * Calls notify-parents with the token. A 400 (a link not signed by us) comes back as an error from invoke: its body
 * says bad_link. No network or a function not yet deployed: an error key.
 */
async function callView(token: string, stop: boolean): Promise<ParentViewResult> {
  const { data, error } = await supabase.functions.invoke('notify-parents', { body: { view: token, ...(stop ? { stop: true } : {}) } });
  if (error) {
    const context = (error as { context?: Response }).context;
    const body = context && typeof context.json === 'function' ? await context.json().catch(() => null) : null;
    if (body && (body as Row).error === 'bad_link') return { kind: 'bad_link' };
    return { kind: 'error', errorKey: context ? 'parentView.loadFailed' : 'common.networkError' };
  }
  return viewResultOf(data as Row);
}

/** Opens the page for the token. */
export function fetchParentView(token: string): Promise<ParentViewResult> {
  return callView(token, false);
}

/** The parent stops the weekly email, and with it this page (as the email's Unsubscribe). */
export function stopParentView(token: string): Promise<ParentViewResult> {
  return callView(token, true);
}

/** The parent page at a glance, for staff (parent_view_overview). */
export type ParentViewOverview = { enabled: boolean; linkDays: number; opened7: number; opened30: number; children30: number };

type OverviewRow = { enabled: boolean; link_days: number; opened_7: number; opened_30: number; children_30: number };

function overviewOf(row: OverviewRow): ParentViewOverview {
  return {
    enabled: row.enabled === true,
    linkDays: row.link_days ?? 14,
    opened7: row.opened_7 ?? 0,
    opened30: row.opened_30 ?? 0,
    children30: row.children_30 ?? 0,
  };
}

/** The overview; 'missing' before 0063, null = could not load. */
export async function fetchParentViewOverview(): Promise<ParentViewOverview | 'missing' | null> {
  const { data, error } = await supabase.rpc('parent_view_overview');
  if (error) return error.code === 'PGRST202' ? 'missing' : null;
  return data ? overviewOf(data as OverviewRow) : null;
}

/** The Guru switches the parent page on or off (audit log). Returns the new overview, or an error message key. */
export async function switchParentView(on: boolean): Promise<{ overview: ParentViewOverview } | { errorKey: MessageKey }> {
  const { data, error } = await supabase.rpc('set_parent_view', { p_on: on });
  if (error) return { errorKey: error.message === 'not_allowed' ? 'admin.guruOnly' : fallbackErrorKey(error.message) };
  return { overview: overviewOf(data as OverviewRow) };
}
