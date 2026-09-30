// Announcements: posting, pinning and deleting (screen C15, coordinators and the Guru), reading
// them (S10, students), and "seen by N of M" with the list of who has not seen one yet.
//
// The app writes the announcements table directly: insert = post, update = pin or unpin,
// delete. Opening an announcement inserts one announcement_reads row (the read receipt).
// Row-level security decides who sees what, a database trigger checks every announcement, and
// the views announcement_seen / announcement_audience count and list who it is addressed to
// (supabase/migrations/0007_announcements.sql, docs/DECISIONS.md #25). The app never counts
// read receipts itself, so every phone shows the same number.

import type { ParseKeys } from 'i18next';

import { momentInIndia, parseDayMonthYear, parseTimeOfDay } from '@/lib/dates';
import { supabase } from '@/lib/supabase';

import { isNetworkError } from './errors';
import { fetchStaff } from './student-overview';

/** A translation key for a message. */
type MessageKey = ParseKeys;

/** Longest title the database accepts, in characters (same limit as the trigger in 0007). */
export const TITLE_MAX_LENGTH = 120;
/** Longest message text the database accepts, in characters (same limit as the trigger in 0007). */
export const BODY_MAX_LENGTH = 4000;
/** How many announcements a list loads, newest first; older ones are rarely needed. */
const LIST_LIMIT = 100;

/**
 * Who an announcement is for, as stored in announcements.audience: all students, the students of
 * one level, the author's mentees, staff only (Guru and coordinators), or the members of a group.
 * Staff see every announcement whatever its audience.
 */
export const AUDIENCES = ['all', 'level', 'mentees', 'staff', 'group'] as const;
export type Audience = (typeof AUDIENCES)[number];

/** One announcement. */
export type Announcement = {
  id: number;
  title: string;
  body: string;
  audience: Audience;
  /** Level id when `audience` is 'level', else null. */
  audienceLevel: number | null;
  /** Group id when `audience` is 'group', else null. */
  audienceGroup: number | null;
  pinned: boolean;
  /** ISO timestamp from which students see it. Later than now = scheduled. */
  publishAt: string;
  /** Profile id of the author. */
  createdBy: string | null;
  /** True when the signed-in person has opened it before. */
  readByMe: boolean;
};

/** "Seen by N of M" for one announcement, counted by the database (view announcement_seen). */
export type SeenCount = {
  /** People it is addressed to who can open it in the app; the author is not counted. */
  addressed: number;
  /** How many of them have opened it. */
  seen: number;
  /** Students it is meant for who have no app login (not counting those who left). */
  noLogin: number;
};

type AnnouncementRow = {
  id: number;
  title: string;
  body: string;
  audience: Audience;
  audience_level: number | null;
  audience_group: number | null;
  pinned: boolean;
  publish_at: string;
  created_by: string | null;
};

const ANNOUNCEMENT_COLUMNS = 'id, title, body, audience, audience_level, audience_group, pinned, publish_at, created_by';

/** Turns an announcements row into the app's shape. */
function toAnnouncement(row: AnnouncementRow, readIds: ReadonlySet<number>): Announcement {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    audience: row.audience,
    audienceLevel: row.audience_level,
    audienceGroup: row.audience_group,
    pinned: row.pinned,
    publishAt: row.publish_at,
    createdBy: row.created_by,
    readByMe: readIds.has(row.id),
  };
}

/** True while an announcement is scheduled for later, i.e. students cannot see it yet. */
export function isScheduled(announcement: Pick<Announcement, 'publishAt'>, now = Date.now()): boolean {
  return Date.parse(announcement.publishAt) > now;
}

/**
 * Loads the latest announcements the signed-in person may see, pinned ones first, then newest
 * first, with which of them they have opened. Row-level security picks them: staff get every
 * announcement (scheduled ones too), a student only the published ones addressed to them.
 * Returns null when they could not be loaded (usually no internet).
 */
async function fetchVisibleAnnouncements(myId: string): Promise<Announcement[] | null> {
  const [announcements, reads] = await Promise.all([
    supabase
      .from('announcements')
      .select(ANNOUNCEMENT_COLUMNS)
      .order('pinned', { ascending: false })
      .order('publish_at', { ascending: false })
      .limit(LIST_LIMIT),
    supabase.from('announcement_reads').select('announcement_id').eq('profile_id', myId),
  ]);
  if (announcements.error || reads.error) return null;
  const readIds = new Set((reads.data as { announcement_id: number }[]).map((r) => r.announcement_id));
  return (announcements.data as AnnouncementRow[]).map((row) => toAnnouncement(row, readIds));
}

/** Loads the names of all groups, active or not, by id; used to word a group audience. */
async function fetchGroupNames(): Promise<Map<number, string> | null> {
  const { data, error } = await supabase.from('groups').select('id, name');
  if (error) return null;
  return new Map((data as { id: number; name: string }[]).map((g) => [g.id, g.name]));
}

/** Loads the seen counts of the given announcements. */
async function fetchSeenCounts(ids: number[]): Promise<Map<number, SeenCount> | null> {
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase
    .from('announcement_seen')
    .select('announcement_id, addressed, seen, no_login')
    .in('announcement_id', ids);
  if (error) return null;
  return new Map(
    (data as { announcement_id: number; addressed: number; seen: number; no_login: number }[]).map((row) => [
      row.announcement_id,
      { addressed: row.addressed, seen: row.seen, noLogin: row.no_login },
    ]),
  );
}

// ---------------------------------------------------------------- staff (C15)

/** Everything the staff list of announcements shows. */
export type StaffAnnouncementList = {
  announcements: (Announcement & { seenCount: SeenCount | null })[];
  /** Group names by id, for group audiences. */
  groupNames: Map<number, string>;
  /** Guru and coordinator names by profile id, for "posted by". */
  staffNames: Map<string, string>;
};

/**
 * Loads the staff list: the latest announcements with their seen counts, and the names needed to
 * word them. `myId` is the signed-in person's profile id. Returns null when it could not be loaded.
 */
export async function fetchStaffAnnouncements(myId: string): Promise<StaffAnnouncementList | null> {
  const [announcements, groupNames, staff] = await Promise.all([
    fetchVisibleAnnouncements(myId),
    fetchGroupNames(),
    fetchStaff(),
  ]);
  if (!announcements || !groupNames || !staff) return null;
  const seen = await fetchSeenCounts(announcements.map((a) => a.id));
  if (!seen) return null;
  return {
    announcements: announcements.map((a) => ({ ...a, seenCount: seen.get(a.id) ?? null })),
    groupNames,
    staffNames: new Map(staff.map((s) => [s.id, s.fullName])),
  };
}

/** One person an announcement is addressed to, and when they first opened it. */
export type AudienceMember = {
  profileId: string;
  fullName: string;
  /** Roll number when the person is a student, else null (staff). */
  rollNo: string | null;
  /** ISO timestamp they first opened it, or null while not seen. */
  readAt: string | null;
};

/** Everything the staff detail of one announcement shows. */
export type StaffAnnouncementDetail = {
  announcement: Announcement;
  seenCount: SeenCount;
  /** Everyone it is addressed to, by name. */
  audience: AudienceMember[];
  groupName: string | null;
  authorName: string | null;
};

/**
 * Loads one announcement for the staff detail screen, with its seen count and everyone it is
 * addressed to. Returns 'not_found' when it is not there (deleted), null when it could not be loaded.
 */
export async function fetchStaffAnnouncement(
  id: number,
  myId: string,
): Promise<StaffAnnouncementDetail | 'not_found' | null> {
  const [row, read, seen, audience, groupNames, staff] = await Promise.all([
    supabase.from('announcements').select(ANNOUNCEMENT_COLUMNS).eq('id', id).maybeSingle(),
    supabase.from('announcement_reads').select('announcement_id').eq('announcement_id', id).eq('profile_id', myId),
    fetchSeenCounts([id]),
    supabase
      .from('announcement_audience')
      .select('profile_id, full_name, roll_no, read_at')
      .eq('announcement_id', id)
      .order('full_name'),
    fetchGroupNames(),
    fetchStaff(),
  ]);
  if (row.error || read.error || !seen || audience.error || !groupNames || !staff) return null;
  if (!row.data) return 'not_found';
  const announcement = toAnnouncement(row.data as AnnouncementRow, new Set(read.data.length > 0 ? [id] : []));
  return {
    announcement,
    seenCount: seen.get(id) ?? { addressed: 0, seen: 0, noLogin: 0 },
    audience: (
      audience.data as { profile_id: string; full_name: string; roll_no: string | null; read_at: string | null }[]
    ).map((m) => ({ profileId: m.profile_id, fullName: m.full_name, rollNo: m.roll_no, readAt: m.read_at })),
    groupName: announcement.audienceGroup !== null ? (groupNames.get(announcement.audienceGroup) ?? null) : null,
    authorName: staff.find((s) => s.id === announcement.createdBy)?.fullName ?? null,
  };
}

/** What happened when an announcement was changed; `errorKey` means nothing was saved. */
export type ChangeOutcome = { errorKey?: MessageKey };

/** Pins an announcement to the top of every list, or unpins it. Only the author or the Guru may. */
export async function setPinned(id: number, pinned: boolean): Promise<ChangeOutcome> {
  const { data, error } = await supabase.from('announcements').update({ pinned }).eq('id', id).select('id');
  if (error) return { errorKey: announcementErrorKey(error.message, error.code) };
  // Row-level security turns a change the person may not make into "nothing changed".
  return data.length === 0 ? { errorKey: 'announcements.errors.cannotChange' } : {};
}

/**
 * Deletes an announcement for everyone, with its read receipts. Only the author or the Guru may;
 * the audit log keeps a copy.
 */
export async function deleteAnnouncement(id: number): Promise<ChangeOutcome> {
  const { data, error } = await supabase.from('announcements').delete().eq('id', id).select('id');
  if (error) return { errorKey: announcementErrorKey(error.message, error.code) };
  return data.length === 0 ? { errorKey: 'announcements.errors.cannotChange' } : {};
}

// ---------------------------------------------------------------- posting (C15)

/** Everything typed or chosen on the compose screen. */
export type AnnouncementForm = {
  title: string;
  body: string;
  audience: Audience | null;
  /** Level id, when the audience is 'level'. */
  levelId: number | null;
  /** Group id, when the audience is 'group'. */
  groupId: number | null;
  pinned: boolean;
  /** Publish now, or at the date and time below. */
  when: 'now' | 'later';
  /** As typed, day-month-year, e.g. '04-10-2026'. */
  date: string;
  /** As typed, 24-hour India time, e.g. '18:30'. */
  time: string;
};

/** An empty compose form: for all students, published at once. */
export const EMPTY_ANNOUNCEMENT_FORM: AnnouncementForm = {
  title: '',
  body: '',
  audience: 'all',
  levelId: null,
  groupId: null,
  pinned: false,
  when: 'now',
  date: '',
  time: '',
};

/** A problem with one field of the compose form, as the key of the message to show under it. */
export type AnnouncementFormErrors = Partial<Record<keyof AnnouncementForm, MessageKey>>;

/**
 * Checks the compose form before it is sent; every problem is reported at once. `now` is the
 * current time in milliseconds. The database checks title, text and audience again (0007).
 */
export function checkAnnouncementForm(form: AnnouncementForm, now: number): AnnouncementFormErrors {
  const errors: AnnouncementFormErrors = {};
  const title = form.title.trim();
  const body = form.body.trim();
  if (!title) errors.title = 'announcements.errors.titleRequired';
  else if (title.length > TITLE_MAX_LENGTH) errors.title = 'announcements.errors.titleTooLong';
  if (!body) errors.body = 'announcements.errors.bodyRequired';
  else if (body.length > BODY_MAX_LENGTH) errors.body = 'announcements.errors.bodyTooLong';
  if (!form.audience) errors.audience = 'announcements.errors.choose';
  if (form.audience === 'level' && form.levelId === null) errors.levelId = 'announcements.errors.choose';
  if (form.audience === 'group' && form.groupId === null) errors.groupId = 'announcements.errors.choose';
  if (form.when === 'later') {
    const date = parseDayMonthYear(form.date);
    const time = parseTimeOfDay(form.time);
    if (!form.date.trim()) errors.date = 'announcements.errors.dateRequired';
    else if (!date) errors.date = 'announcements.errors.dateInvalid';
    if (!form.time.trim()) errors.time = 'announcements.errors.timeRequired';
    else if (!time) errors.time = 'announcements.errors.timeInvalid';
    if (date && time && Date.parse(momentInIndia(date, time)) <= now) errors.time = 'announcements.errors.timePast';
  }
  return errors;
}

/** The publish time the form asks for, as an ISO timestamp, or null for "now". */
function publishAtOf(form: AnnouncementForm): string | null {
  if (form.when === 'now') return null;
  const date = parseDayMonthYear(form.date);
  const time = parseTimeOfDay(form.time);
  return date && time ? momentInIndia(date, time) : null;
}

/**
 * Posts an announcement. The database records the signed-in person as author and, without a
 * publish time, publishes it at once. Returns the new id. Call only after checkAnnouncementForm
 * found no problems.
 */
export async function postAnnouncement(form: AnnouncementForm): Promise<{ id?: number; errorKey?: MessageKey }> {
  if (!form.audience) return { errorKey: 'announcements.errors.choose' };
  const publishAt = publishAtOf(form);
  const { data, error } = await supabase
    .from('announcements')
    .insert({
      title: form.title.trim(),
      body: form.body.trim(),
      audience: form.audience,
      audience_level: form.audience === 'level' ? form.levelId : null,
      audience_group: form.audience === 'group' ? form.groupId : null,
      pinned: form.pinned,
      // Left out for "now", so the database's own clock sets it, not the phone's.
      ...(publishAt ? { publish_at: publishAt } : {}),
    })
    .select('id')
    .single();
  if (error) return { errorKey: announcementErrorKey(error.message, error.code) };
  return { id: (data as { id: number }).id };
}

/** What the compose screen offers besides levels: the groups, and whether I mentor anyone. */
export type ComposeOptions = {
  /** Active groups, by name. */
  groups: { id: number; name: string }[];
  /** True when the signed-in person mentors at least one student, so "My mentees" makes sense. */
  hasMentees: boolean;
};

/** Loads the compose options for the signed-in person (`myId`). Returns null when it could not be loaded. */
export async function fetchComposeOptions(myId: string): Promise<ComposeOptions | null> {
  const [groups, mentees] = await Promise.all([
    supabase.from('groups').select('id, name').eq('active', true).order('name'),
    // head: true asks only for the number of rows, not the rows themselves.
    supabase.from('students').select('id', { count: 'exact', head: true }).eq('mentor_id', myId),
  ]);
  if (groups.error || mentees.error) return null;
  return { groups: groups.data as { id: number; name: string }[], hasMentees: (mentees.count ?? 0) > 0 };
}

// ---------------------------------------------------------------- students (S10)

/** The student list of announcements, with group names for group audiences. */
export type MyAnnouncementList = { announcements: Announcement[]; groupNames: Map<number, string> };

/**
 * Loads the announcements addressed to the signed-in student, pinned first, then newest first,
 * with which ones they have opened. Scheduled ones stay hidden until their time (row-level
 * security). Returns null when they could not be loaded.
 */
export async function fetchMyAnnouncements(myId: string): Promise<MyAnnouncementList | null> {
  const [announcements, groupNames] = await Promise.all([fetchVisibleAnnouncements(myId), fetchGroupNames()]);
  if (!announcements || !groupNames) return null;
  return { announcements, groupNames };
}

/**
 * Loads one announcement for its reader, with its group name. Returns 'not_found' when it is not
 * there or not addressed to them, null when it could not be loaded.
 */
export async function fetchAnnouncement(
  id: number,
): Promise<{ announcement: Announcement; groupName: string | null } | 'not_found' | null> {
  const [row, groupNames] = await Promise.all([
    supabase.from('announcements').select(ANNOUNCEMENT_COLUMNS).eq('id', id).maybeSingle(),
    fetchGroupNames(),
  ]);
  if (row.error || !groupNames) return null;
  if (!row.data) return 'not_found';
  const announcement = toAnnouncement(row.data as AnnouncementRow, new Set());
  return {
    announcement,
    groupName: announcement.audienceGroup !== null ? (groupNames.get(announcement.audienceGroup) ?? null) : null,
  };
}

/**
 * Saves the read receipt: the signed-in person has opened this announcement. The database fills
 * in who and when; it keeps only the first opening, so opening it again changes nothing. A
 * failure is not shown: the person has the text in front of them, and the next opening tries
 * again. Returns true when a receipt is now on record.
 */
export async function markRead(id: number): Promise<boolean> {
  const { error } = await supabase.from('announcement_reads').insert({ announcement_id: id });
  // 23505 = already read before; that receipt, with its first time, is kept.
  return !error || error.code === '23505';
}

// ---------------------------------------------------------------- errors

/** Turns a database error from the calls above into a translation key. Codes: migration 0007. */
function announcementErrorKey(message: string, code: string | undefined): MessageKey {
  switch (message) {
    case 'title_required':
      return 'announcements.errors.titleRequired';
    case 'title_too_long':
      return 'announcements.errors.titleTooLong';
    case 'body_required':
      return 'announcements.errors.bodyRequired';
    case 'body_too_long':
      return 'announcements.errors.bodyTooLong';
    case 'level_required':
    case 'group_required':
      return 'announcements.errors.choose';
  }
  // 42501 = refused by row-level security: the person is not a coordinator or the Guru.
  if (code === '42501') return 'announcements.errors.notAllowed';
  // 23503 = the chosen group was deleted meanwhile.
  if (code === '23503') return 'announcements.errors.groupGone';
  if (isNetworkError(message)) return 'common.networkError';
  return 'common.genericError';
}
