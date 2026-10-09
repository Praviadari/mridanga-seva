// Announcements: posting, editing, pinning and deleting (screen C15, coordinators and the Guru),
// reading them (S10, students), "seen by N of M" with the list of who has not seen one yet,
// private replies, and the photos and PDFs on them.
//
// The app writes the announcements table directly: insert = post, update = edit, pin or unpin,
// delete. Opening an announcement inserts one announcement_reads row (the read receipt); a reply
// is one announcement_replies row. Row-level security decides who sees what, database triggers
// check every announcement and reply, and the views announcement_seen / announcement_audience
// count and list who it is addressed to (supabase/migrations/0007_announcements.sql and
// 0008_announcement_follow_ups.sql, docs/DECISIONS.md #25-#29). The app never counts read
// receipts itself, so every phone shows the same number. Files are uploaded to Storage just
// before the announcement is saved, and removed from Storage when they are taken off it
// (./announcement-files.ts, migration 0010, docs/DECISIONS.md #32).

import type { ParseKeys } from 'i18next';

import { formatTypedDate, localDate, localMoment, localTime, parseDayMonthYear, parseTimeOfDay } from '@/lib/dates';
import { supabase } from '@/lib/supabase';

import {
  formFilesOf,
  isPicked,
  MAX_FILES,
  missingFiles,
  parseAttachments,
  removeFiles,
  uploadFiles,
  type Attachment,
  type FormFile,
} from './announcement-files';
import { isNetworkError } from './errors';

/** A translation key for a message. */
type MessageKey = ParseKeys;

/** Longest title the database accepts, in characters (same limit as the trigger in 0007). */
export const TITLE_MAX_LENGTH = 120;
/** Longest message text the database accepts, in characters (same limit as the trigger in 0007). */
export const BODY_MAX_LENGTH = 4000;
/** Longest reply the database accepts, in characters (same limit as the trigger in 0008). */
export const REPLY_MAX_LENGTH = 1000;
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
  /**
   * ISO timestamp of the last change to the title, text or audience after it was published, or
   * null when never edited. Set by the database; pinning does not count (docs/DECISIONS.md #27).
   */
  editedAt: string | null;
  /** Photos and PDFs, at most 3, in the order the author added them. */
  attachments: Attachment[];
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
  /** Replies the signed-in person may read: all of them for the author and the Guru. */
  replies: number;
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
  edited_at: string | null;
  attachments: unknown;
};

const ANNOUNCEMENT_COLUMNS =
  'id, title, body, audience, audience_level, audience_group, pinned, publish_at, created_by, edited_at, attachments';

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
    editedAt: row.edited_at,
    attachments: parseAttachments(row.attachments),
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

/**
 * Loads the names of the groups the signed-in person may see, active or not, by id; used to word
 * a group audience. Staff see every group, a student only the groups they are in (0008).
 */
async function fetchGroupNames(): Promise<Map<number, string> | null> {
  const { data, error } = await supabase.from('groups').select('id, name');
  if (error) return null;
  return new Map((data as { id: number; name: string }[]).map((g) => [g.id, g.name]));
}

/**
 * Loads the names of the Guru and every coordinator (active or not) by profile id, for "posted
 * by". Uses the database function staff_names(), because a student may not read other people's
 * profiles; it gives names only (docs/DECISIONS.md #26). Returns null when it could not be loaded.
 */
async function fetchStaffNames(): Promise<Map<string, string> | null> {
  const { data, error } = await supabase.rpc('staff_names');
  if (error) return null;
  return new Map((data as { id: string; full_name: string }[]).map((s) => [s.id, s.full_name]));
}

/** Loads the seen counts of the given announcements. */
async function fetchSeenCounts(ids: number[]): Promise<Map<number, SeenCount> | null> {
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase
    .from('announcement_seen')
    .select('announcement_id, addressed, seen, no_login, replies')
    .in('announcement_id', ids);
  if (error) return null;
  return new Map(
    (
      data as { announcement_id: number; addressed: number; seen: number; no_login: number; replies: number }[]
    ).map((row) => [
      row.announcement_id,
      { addressed: row.addressed, seen: row.seen, noLogin: row.no_login, replies: row.replies },
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
  const [announcements, groupNames, staffNames] = await Promise.all([
    fetchVisibleAnnouncements(myId),
    fetchGroupNames(),
    fetchStaffNames(),
  ]);
  if (!announcements || !groupNames || !staffNames) return null;
  const seen = await fetchSeenCounts(announcements.map((a) => a.id));
  if (!seen) return null;
  return {
    announcements: announcements.map((a) => ({ ...a, seenCount: seen.get(a.id) ?? null })),
    groupNames,
    staffNames,
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
  /**
   * The replies the signed-in person may read, oldest first: every reply for the author and the
   * Guru, only their own for anyone else.
   */
  replies: Reply[];
};

/**
 * Loads one announcement for the staff detail screen, with its seen count, everyone it is
 * addressed to and its replies. Returns 'not_found' when it is not there (deleted), null when it
 * could not be loaded.
 */
export async function fetchStaffAnnouncement(
  id: number,
  myId: string,
): Promise<StaffAnnouncementDetail | 'not_found' | null> {
  const [row, read, seen, audience, groupNames, staffNames, replies] = await Promise.all([
    supabase.from('announcements').select(ANNOUNCEMENT_COLUMNS).eq('id', id).maybeSingle(),
    supabase.from('announcement_reads').select('announcement_id').eq('announcement_id', id).eq('profile_id', myId),
    fetchSeenCounts([id]),
    supabase
      .from('announcement_audience')
      .select('profile_id, full_name, roll_no, read_at')
      .eq('announcement_id', id)
      .order('full_name'),
    fetchGroupNames(),
    fetchStaffNames(),
    fetchReplies(id),
  ]);
  if (row.error || read.error || !seen || audience.error || !groupNames || !staffNames || !replies) return null;
  if (!row.data) return 'not_found';
  const announcement = toAnnouncement(row.data as AnnouncementRow, new Set(read.data.length > 0 ? [id] : []));
  return {
    announcement,
    seenCount: seen.get(id) ?? { addressed: 0, seen: 0, noLogin: 0, replies: 0 },
    audience: (
      audience.data as { profile_id: string; full_name: string; roll_no: string | null; read_at: string | null }[]
    ).map((m) => ({ profileId: m.profile_id, fullName: m.full_name, rollNo: m.roll_no, readAt: m.read_at })),
    groupName: announcement.audienceGroup !== null ? (groupNames.get(announcement.audienceGroup) ?? null) : null,
    authorName: announcement.createdBy ? (staffNames.get(announcement.createdBy) ?? null) : null,
    replies,
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
 * Deletes an announcement for everyone, with its read receipts, replies and files. Only the author
 * or the Guru may; the audit log keeps a copy of the announcement (not of its files).
 */
export async function deleteAnnouncement(announcement: Announcement, myId: string): Promise<ChangeOutcome> {
  // Someone else's files first, while the announcement still lists them: Storage lets the author
  // remove a file the Guru added only while it is on their announcement (migration 0010). My own
  // files after the row, so a failed delete never leaves a live post listing files that are gone
  // (D5-14). Deleting the row does not remove the files by itself.
  const [mine, others] = splitByOwner(announcement.attachments.map((a) => a.path), myId);
  if (!(await removeFiles(others))) return { errorKey: 'announcements.files.removeFailed' };
  const { data, error } = await supabase.from('announcements').delete().eq('id', announcement.id).select('id');
  if (error) return { errorKey: announcementErrorKey(error.message, error.code) };
  if (data.length === 0) return { errorKey: 'announcements.errors.cannotChange' };
  // If this fails (no internet), my files stay in Storage unused; docs/OPERATIONS.md "Files no announcement uses".
  await removeFiles(mine);
  return {};
}

/** The paths in `myId`'s folder, and the others (uploaded by someone else, e.g. the Guru). */
function splitByOwner(paths: string[], myId: string): [string[], string[]] {
  const mine = paths.filter((p) => p.startsWith(`${myId}/`));
  return [mine, paths.filter((p) => !p.startsWith(`${myId}/`))];
}

// ---------------------------------------------------------------- posting and editing (C15)

/** Everything typed or chosen on the compose and edit screens. */
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
  /** As typed, 24-hour class time, e.g. '18:30'. */
  time: string;
  /** Photos and PDFs: saved ones and ones picked on this device, uploaded when saving. */
  files: FormFile[];
};

/** An empty compose form: for all students, published at once, no files. */
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
  files: [],
};

/**
 * The edit form filled in from a saved announcement. A scheduled one keeps its date and time
 * (the class's time) under "Later"; for a published one the time cannot change, so "when" is unused.
 */
export function formFromAnnouncement(announcement: Announcement): AnnouncementForm {
  const scheduled = isScheduled(announcement);
  return {
    title: announcement.title,
    body: announcement.body,
    audience: announcement.audience,
    levelId: announcement.audienceLevel,
    groupId: announcement.audienceGroup,
    pinned: announcement.pinned,
    when: scheduled ? 'later' : 'now',
    date: scheduled ? formatTypedDate(localDate(announcement.publishAt)) : '',
    time: scheduled ? localTime(announcement.publishAt) : '',
    files: formFilesOf(announcement.attachments),
  };
}

/** How far ahead an announcement may be scheduled: 182 days, a day inside the database's 183 (0038). */
const MAX_SCHEDULE_MS = 182 * 24 * 60 * 60 * 1000;

/** A problem with one field of the compose form, as the key of the message to show under it. */
export type AnnouncementFormErrors = Partial<Record<keyof AnnouncementForm, MessageKey>>;

/**
 * Checks the compose or edit form before it is sent; every problem is reported at once. `now` is
 * the current time in milliseconds. `checkWhen` is false when editing a published announcement,
 * whose time cannot change. The database checks title, text and audience again (0007, 0008).
 */
export function checkAnnouncementForm(form: AnnouncementForm, now: number, checkWhen = true): AnnouncementFormErrors {
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
  if (form.files.length > MAX_FILES) errors.files = 'announcements.files.tooMany';
  if (checkWhen && form.when === 'later') {
    const date = parseDayMonthYear(form.date);
    const time = parseTimeOfDay(form.time);
    if (!form.date.trim()) errors.date = 'announcements.errors.dateRequired';
    else if (!date) errors.date = 'announcements.errors.dateInvalid';
    if (!form.time.trim()) errors.time = 'announcements.errors.timeRequired';
    else if (!time) errors.time = 'announcements.errors.timeInvalid';
    if (date && time && Date.parse(localMoment(date, time)) <= now) errors.time = 'announcements.errors.timePast';
    // Six months at most (D6-14): a year typo would hide the post for decades. The database allows 183 days (0038).
    else if (date && time && Date.parse(localMoment(date, time)) > now + MAX_SCHEDULE_MS) errors.date = 'announcements.errors.dateTooFar';
  }
  return errors;
}

/** The publish time the form asks for, as an ISO timestamp, or null for "now". */
function publishAtOf(form: AnnouncementForm): string | null {
  if (form.when === 'now') return null;
  const date = parseDayMonthYear(form.date);
  const time = parseTimeOfDay(form.time);
  return date && time ? localMoment(date, time) : null;
}

/** The columns the form writes, apart from the publish time. */
function contentOf(form: AnnouncementForm & { audience: Audience }) {
  return {
    title: form.title.trim(),
    body: form.body.trim(),
    audience: form.audience,
    audience_level: form.audience === 'level' ? form.levelId : null,
    audience_group: form.audience === 'group' ? form.groupId : null,
    pinned: form.pinned,
  };
}

/**
 * Uploads the form's newly picked files into `myId`'s folder and returns the whole file list in
 * the form's order, saved files as they were. `uploaded` are the paths of the new uploads, to
 * remove again if saving the announcement then fails.
 */
async function attachmentsOf(
  form: AnnouncementForm,
  myId: string,
): Promise<{ attachments?: Attachment[]; uploaded: string[]; errorKey?: MessageKey }> {
  const picked = form.files.filter(isPicked);
  const result = await uploadFiles(myId, picked);
  if (!result.attachments) return { uploaded: [], errorKey: result.errorKey ?? 'common.genericError' };
  const byKey = new Map(picked.map((file, i) => [file.key, result.attachments?.[i]]));
  const attachments = form.files.flatMap((file): Attachment[] => {
    if (!isPicked(file)) return [{ path: file.path, name: file.name, kind: file.kind, size: file.size }];
    const uploaded = byKey.get(file.key);
    return uploaded ? [uploaded] : [];
  });
  return { attachments, uploaded: result.attachments.map((a) => a.path) };
}

/**
 * Posts an announcement: uploads the picked files into the author's folder (`myId` = the
 * signed-in person's profile id), then saves the announcement with them. The database records
 * the signed-in person as author and, without a publish time, publishes it at once. Returns the
 * new id. If saving fails, the files just uploaded are removed again. Call only after
 * checkAnnouncementForm found no problems.
 */
export async function postAnnouncement(
  form: AnnouncementForm,
  myId: string,
): Promise<{ id?: number; errorKey?: MessageKey }> {
  const { audience } = form;
  if (!audience) return { errorKey: 'announcements.errors.choose' };
  const files = await attachmentsOf(form, myId);
  if (!files.attachments) return { errorKey: files.errorKey };
  const publishAt = publishAtOf(form);
  const { data, error } = await supabase
    .from('announcements')
    .insert({
      ...contentOf({ ...form, audience }),
      attachments: files.attachments,
      // Left out for "now", so the database's own clock sets it, not the phone's.
      ...(publishAt ? { publish_at: publishAt } : {}),
    })
    .select('id')
    .single();
  if (error) {
    // No answer is not a refusal: the post may have been saved, and its files are then in use
    // (D6-10). Look for it before removing anything, so it is neither broken nor posted twice.
    if (isNetworkError(error.message)) {
      const saved = await findJustPosted(myId, contentOf({ ...form, audience }).title, files.uploaded);
      if (saved) return { id: saved };
      // Still unknown (no internet): keep the files; an unused one is cleaned up later.
      return { errorKey: 'announcements.errors.maybeSaved' };
    }
    await removeFiles(files.uploaded);
    return { errorKey: announcementErrorKey(error.message, error.code) };
  }
  return { id: (data as { id: number }).id };
}

/**
 * The id of the announcement I posted in the last 15 minutes with this title (and, when files were
 * uploaded, the first of them), or null when there is none or it could not be read.
 */
async function findJustPosted(myId: string, title: string, uploaded: string[]): Promise<number | null> {
  let query = supabase
    .from('announcements')
    .select('id')
    .eq('created_by', myId)
    .eq('title', title)
    .gte('created_at', new Date(Date.now() - 15 * 60_000).toISOString());
  if (uploaded.length > 0) query = query.contains('attachments', [{ path: uploaded[0] }]);
  const { data, error } = await query.order('created_at', { ascending: false }).limit(1);
  return !error && data.length > 0 ? (data[0] as { id: number }).id : null;
}

/**
 * Saves changes to an announcement. Only the author or the Guru may (row-level security). New
 * files are uploaded into `myId`'s folder first; files taken off are removed from Storage once
 * the change is saved. The read receipts stay; when it was already published the database marks
 * it edited, also for a file added or removed (docs/DECISIONS.md #27, #32). `original` is the
 * announcement as loaded: its publish time is sent only while it is still scheduled, because a
 * published one keeps its time. Call only after checkAnnouncementForm found no problems.
 */
export async function updateAnnouncement(
  original: Announcement,
  form: AnnouncementForm,
  myId: string,
): Promise<ChangeOutcome> {
  const { audience } = form;
  if (!audience) return { errorKey: 'announcements.errors.choose' };
  // D6-15: someone else (the Guru, a second coordinator) may have changed it while this form was
  // open; saving would silently undo their change. Read it again and stop when it differs.
  const current = await supabase.from('announcements').select(ANNOUNCEMENT_COLUMNS).eq('id', original.id).maybeSingle();
  if (current.error) return { errorKey: announcementErrorKey(current.error.message, current.error.code) };
  if (!current.data) return { errorKey: 'announcements.errors.cannotChange' };
  if (changedSince(original, toAnnouncement(current.data as AnnouncementRow, new Set()))) {
    return { errorKey: 'announcements.errors.changedMeanwhile' };
  }
  // D5-14: entries whose file is gone (a removal whose save then failed) are dropped on every save.
  const gone = (await missingFiles(original.attachments.map((a) => a.path))) ?? new Set<string>();
  const files = await attachmentsOf({ ...form, files: form.files.filter((f) => isPicked(f) || !gone.has(f.path)) }, myId);
  if (!files.attachments) return { errorKey: files.errorKey };
  const kept = new Set(files.attachments.map((a) => a.path));
  const dropped = original.attachments.map((a) => a.path).filter((p) => !kept.has(p) && !gone.has(p));
  // FS3-03: a file someone else uploaded can be removed only while it is still listed, so before
  // the save; my own files after it, so readers never meet a file of mine that is listed but gone.
  const [mineDropped, othersDropped] = splitByOwner(dropped, myId);
  if (!(await removeFiles(othersDropped))) {
    await removeFiles(files.uploaded);
    return { errorKey: 'announcements.files.removeFailed' };
  }
  // Checked again now: the scheduled time may have passed while the form was open.
  const timeCanChange = isScheduled(original);
  const { data, error } = await supabase
    .from('announcements')
    .update({
      ...contentOf({ ...form, audience }),
      attachments: files.attachments,
      // null = "now": the database publishes it at its own time.
      ...(timeCanChange ? { publish_at: publishAtOf(form) } : {}),
    })
    .eq('id', original.id)
    .select('id');
  if (error && isNetworkError(error.message)) {
    // D6-10: no answer is not a refusal; the new files stay until it is known whether the change
    // was saved (an unused one is cleaned up later). Saved when the row now holds what was sent.
    const after = await supabase.from('announcements').select(ANNOUNCEMENT_COLUMNS).eq('id', original.id).maybeSingle();
    const sent = contentOf({ ...form, audience });
    const now = after.data ? toAnnouncement(after.data as AnnouncementRow, new Set()) : null;
    const saved = !!now && now.title === sent.title && now.body === sent.body
      && JSON.stringify(now.attachments.map((a) => a.path)) === JSON.stringify(files.attachments.map((a) => a.path));
    if (!saved) return { errorKey: 'announcements.errors.maybeSaved' };
  } else if (error || data.length === 0) {
    await removeFiles(files.uploaded);
    return { errorKey: error ? announcementErrorKey(error.message, error.code) : 'announcements.errors.cannotChange' };
  }
  // If this fails (no internet), the file stays in Storage unused; docs/OPERATIONS.md "Files no announcement uses".
  await removeFiles(mineDropped);
  return {};
}

/** True when the saved announcement differs from the one the form was opened with (D6-15). */
function changedSince(original: Announcement, current: Announcement): boolean {
  const fields = (a: Announcement) =>
    JSON.stringify([a.title, a.body, a.audience, a.audienceLevel, a.audienceGroup, a.pinned, a.publishAt, a.attachments.map((f) => f.path)]);
  return fields(original) !== fields(current);
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

/** The student list of announcements, with the names needed to word them. */
export type MyAnnouncementList = {
  announcements: Announcement[];
  /** Names of the groups the student is in, by id. */
  groupNames: Map<number, string>;
  /** Guru and coordinator names by profile id, for "posted by". */
  staffNames: Map<string, string>;
};

/**
 * Loads the announcements addressed to the signed-in student, pinned first, then newest first,
 * with which ones they have opened. Scheduled ones stay hidden until their time (row-level
 * security). Returns null when they could not be loaded.
 */
export async function fetchMyAnnouncements(myId: string): Promise<MyAnnouncementList | null> {
  const [announcements, groupNames, staffNames] = await Promise.all([
    fetchVisibleAnnouncements(myId),
    fetchGroupNames(),
    fetchStaffNames(),
  ]);
  if (!announcements || !groupNames || !staffNames) return null;
  return { announcements, groupNames, staffNames };
}

/** The student home's news card: the newest few in full, and how many of the latest are unread. */
export type MyLatestAnnouncements = MyAnnouncementList & {
  /** Unread among the same latest LIST_LIMIT the S10 list shows. */
  unread: number;
};

/**
 * Loads only what the student home shows (audit D9-05): the newest `count` announcements in full,
 * and the ids of the latest LIST_LIMIT for the unread count, instead of LIST_LIMIT full posts.
 * Returns null when they could not be loaded.
 */
export async function fetchMyLatestAnnouncements(myId: string, count: number): Promise<MyLatestAnnouncements | null> {
  const [latest, ids, reads, groupNames, staffNames] = await Promise.all([
    supabase
      .from('announcements')
      .select(ANNOUNCEMENT_COLUMNS)
      .order('pinned', { ascending: false })
      .order('publish_at', { ascending: false })
      .limit(count),
    supabase
      .from('announcements')
      .select('id')
      .order('pinned', { ascending: false })
      .order('publish_at', { ascending: false })
      .limit(LIST_LIMIT),
    supabase.from('announcement_reads').select('announcement_id').eq('profile_id', myId),
    fetchGroupNames(),
    fetchStaffNames(),
  ]);
  if (latest.error || ids.error || reads.error || !groupNames || !staffNames) return null;
  const readIds = new Set((reads.data as { announcement_id: number }[]).map((r) => r.announcement_id));
  return {
    announcements: (latest.data as AnnouncementRow[]).map((row) => toAnnouncement(row, readIds)),
    unread: (ids.data as { id: number }[]).filter((r) => !readIds.has(r.id)).length,
    groupNames,
    staffNames,
  };
}

/** One announcement as its reader sees it (S10). */
export type MyAnnouncement = {
  announcement: Announcement;
  groupName: string | null;
  /** Name of the coordinator or Guru who posted it, or null when not known. */
  authorName: string | null;
  /** The reader's own replies to it, oldest first. Nobody else's are ever loaded. */
  myReplies: Reply[];
};

/**
 * Loads one announcement for its reader, with its group name, its author's name and the reader's
 * own replies. Returns 'not_found' when it is not there or not addressed to them, null when it
 * could not be loaded.
 */
export async function fetchAnnouncement(id: number): Promise<MyAnnouncement | 'not_found' | null> {
  const [row, groupNames, staffNames, replies] = await Promise.all([
    supabase.from('announcements').select(ANNOUNCEMENT_COLUMNS).eq('id', id).maybeSingle(),
    fetchGroupNames(),
    fetchStaffNames(),
    // Row-level security gives a student only their own replies.
    fetchReplies(id),
  ]);
  if (row.error || !groupNames || !staffNames || !replies) return null;
  if (!row.data) return 'not_found';
  const announcement = toAnnouncement(row.data as AnnouncementRow, new Set());
  return {
    announcement,
    groupName: announcement.audienceGroup !== null ? (groupNames.get(announcement.audienceGroup) ?? null) : null,
    authorName: announcement.createdBy ? (staffNames.get(announcement.createdBy) ?? null) : null,
    myReplies: replies,
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

// ---------------------------------------------------------------- private replies (S10, C15)

/**
 * One reply to an announcement. Only its writer, the announcement's author and the Guru can read
 * it; students never see each other's replies (docs/DECISIONS.md #29).
 */
export type Reply = {
  id: number;
  /** Profile id of the writer. */
  profileId: string;
  /** Name on the student record for students, the login's name for staff. */
  fullName: string;
  /** Roll number when the writer is a student, else null. */
  rollNo: string | null;
  body: string;
  /** ISO timestamp it was sent. */
  createdAt: string;
};

/**
 * Loads the replies to one announcement that the signed-in person may read, oldest first.
 * Returns null when they could not be loaded.
 */
async function fetchReplies(announcementId: number): Promise<Reply[] | null> {
  const { data, error } = await supabase
    .from('announcement_reply_list')
    .select('id, profile_id, full_name, roll_no, body, created_at')
    .eq('announcement_id', announcementId)
    .order('created_at');
  if (error) return null;
  return (
    data as { id: number; profile_id: string; full_name: string; roll_no: string | null; body: string; created_at: string }[]
  ).map((r) => ({
    id: r.id,
    profileId: r.profile_id,
    fullName: r.full_name,
    rollNo: r.roll_no,
    body: r.body,
    createdAt: r.created_at,
  }));
}

/** Checks a reply before it is sent. Returns the message key of the problem, or undefined. */
export function checkReply(body: string): MessageKey | undefined {
  const text = body.trim();
  if (!text) return 'announcements.errors.replyRequired';
  if (text.length > REPLY_MAX_LENGTH) return 'announcements.errors.replyTooLong';
  return undefined;
}

/**
 * Sends a private reply to an announcement the signed-in person can see. The database records
 * who wrote it and when. Call only after checkReply found no problem.
 */
export async function sendReply(announcementId: number, body: string): Promise<ChangeOutcome> {
  const { error } = await supabase.from('announcement_replies').insert({ announcement_id: announcementId, body: body.trim() });
  if (!error) return {};
  // 42501 = row-level security: the announcement is no longer addressed to this person;
  // 23503 = it was deleted meanwhile.
  if (error.code === '42501' || error.code === '23503') return { errorKey: 'announcements.errors.replyGone' };
  return { errorKey: announcementErrorKey(error.message, error.code) };
}

/** Deletes a reply (moderation). Only the Guru may; the audit log keeps a copy. */
export async function deleteReply(replyId: number): Promise<ChangeOutcome> {
  const { data, error } = await supabase.from('announcement_replies').delete().eq('id', replyId).select('id');
  if (error) return { errorKey: announcementErrorKey(error.message, error.code) };
  return data.length === 0 ? { errorKey: 'announcements.errors.cannotChange' } : {};
}

// ---------------------------------------------------------------- errors

/** Turns a database error from the calls above into a translation key. Codes: migrations 0007, 0008, 0010. */
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
    case 'already_published':
      return 'announcements.errors.alreadyPublished';
    case 'publish_too_far':
      return 'announcements.errors.dateTooFar';
    case 'reply_required':
      return 'announcements.errors.replyRequired';
    case 'reply_too_long':
      return 'announcements.errors.replyTooLong';
    case 'too_many_attachments':
      return 'announcements.files.tooMany';
    case 'attachments_invalid':
    case 'attachment_not_yours':
    case 'attachment_missing':
      // The app should not send these: names are cut to 120 characters when picked (fitFileName),
      // so a file that vanished between upload and save is the likely case.
      return 'announcements.files.saveFailed';
  }
  // 42501 = refused by row-level security: the person is not a coordinator or the Guru.
  if (code === '42501') return 'announcements.errors.notAllowed';
  // 23503 = the chosen group was deleted meanwhile.
  if (code === '23503') return 'announcements.errors.groupGone';
  if (isNetworkError(message)) return 'common.networkError';
  return 'common.genericError';
}
