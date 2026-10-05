// Events (Phase 2 slice 5): C16 for coordinators and the Guru (create, edit, cancel, who is coming,
// performers, attendance, Remind) and S11 for students (list, detail, Going / Maybe / Not going,
// add to calendar). Migration 0022 (docs/DECISIONS.md #61, docs/DATABASE.md "Events and polls").
//
// The app writes the events table directly (create, edit, cancel, delete), like announcements;
// answers, performers, attendance and reminders go through database functions. Row-level security
// picks the events: staff see every event, a student those for them (and those they perform at).
// Students get counts only (event_counts); names come from event_people_list, staff only.

import type { ParseKeys } from 'i18next';

import {
  dateInIndia,
  formatDayMonthYear,
  momentInIndia,
  parseDayMonthYear,
  parseTimeOfDay,
  timeInIndia,
  todayInIndia,
} from '@/lib/dates';
import { supabase } from '@/lib/supabase';

import type { Audience } from './announcements';
import { isNetworkError } from './errors';

type MessageKey = ParseKeys;

export const EVENT_TITLE_MAX = 120;
export const EVENT_DESCRIPTION_MAX = 4000;
export const EVENT_PLACE_MAX = 200;
export const CANCEL_REASON_MAX = 500;
export const PART_MAX = 60;
/** How far back the lists go: older events are history nobody needs on a phone. */
const PAST_DAYS = 60;

/** An answer to an event. */
export const RESPONSES = ['going', 'maybe', 'not_going'] as const;
export type EventResponse = (typeof RESPONSES)[number];

/** One event. Times are ISO timestamps. */
export type ClassEvent = {
  id: number;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string | null;
  centreId: number | null;
  place: string | null;
  audience: Audience;
  audienceLevel: number | null;
  audienceGroup: number | null;
  createdBy: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  lastRemindedAt: string | null;
};

/** Counts of one event (event_counts), and the signed-in person's own answer, part and attendance. */
export type EventCounts = {
  /** People it is for who can open the app (and its performers). */
  addressed: number;
  going: number;
  maybe: number;
  notGoing: number;
  performers: number;
  attended: number;
  myResponse: EventResponse | null;
  myPart: string | null;
  iAttended: boolean;
  /** The event is for them (or they perform at it): they may answer. */
  canAnswer: boolean;
};

const NO_COUNTS: EventCounts = {
  addressed: 0, going: 0, maybe: 0, notGoing: 0, performers: 0, attended: 0, myResponse: null, myPart: null, iAttended: false, canAnswer: false,
};

type EventRow = {
  id: number;
  title: string;
  description: string;
  starts_at: string;
  ends_at: string | null;
  centre_id: number | null;
  place: string | null;
  audience: Audience;
  audience_level: number | null;
  audience_group: number | null;
  created_by: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  last_reminded_at: string | null;
};

const EVENT_COLUMNS =
  'id, title, description, starts_at, ends_at, centre_id, place, audience, audience_level, audience_group, created_by, cancelled_at, cancel_reason, last_reminded_at';

function toEvent(r: EventRow): ClassEvent {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    centreId: r.centre_id,
    place: r.place,
    audience: r.audience,
    audienceLevel: r.audience_level,
    audienceGroup: r.audience_group,
    createdBy: r.created_by,
    cancelledAt: r.cancelled_at,
    cancelReason: r.cancel_reason,
    lastRemindedAt: r.last_reminded_at,
  };
}

/** True once the event has ended (or started, when it has no end). */
export function isOver(event: Pick<ClassEvent, 'startsAt' | 'endsAt'>, now = Date.now()): boolean {
  return Date.parse(event.endsAt ?? event.startsAt) < now;
}

/** True once the event has started: answers are closed. */
export function hasStarted(event: Pick<ClassEvent, 'startsAt'>, now = Date.now()): boolean {
  return Date.parse(event.startsAt) <= now;
}

/** True from the event's day (India) on: attendance can be ticked. */
export function isEventDay(event: Pick<ClassEvent, 'startsAt'>): boolean {
  return dateInIndia(event.startsAt) <= todayInIndia();
}

/** True while staff may press Remind again (12 hours after the last one, as the database). */
export function canRemind(event: Pick<ClassEvent, 'lastRemindedAt'>, now = Date.now()): boolean {
  return !event.lastRemindedAt || Date.parse(event.lastRemindedAt) <= now - 12 * 3600_000;
}

function errorKeyOf(message: string): MessageKey {
  if (isNetworkError(message)) return 'common.networkError';
  const code = EVENT_ERROR_CODES.find((c) => message === c);
  if (code) return `events.errors.${code}` as MessageKey;
  if (/row-level security|permission denied/i.test(message)) return 'events.errors.not_allowed';
  return 'common.genericError';
}

const EVENT_ERROR_CODES = [
  'not_allowed', 'event_not_found', 'event_cancelled', 'event_started', 'event_over', 'event_has_answers', 'title_required',
  'title_too_long', 'description_too_long', 'place_required', 'place_too_long', 'centre_invalid', 'starts_required',
  'starts_past', 'starts_too_far', 'ends_invalid', 'audience_invalid', 'level_required', 'group_required', 'audience_locked',
  'reason_too_long', 'too_many', 'student_invalid', 'part_invalid', 'too_early', 'too_soon', 'response_invalid',
] as const;

/** Names needed to word events: centres and groups by id, staff by profile id. */
export type EventNames = {
  centres: Map<number, string>;
  groups: Map<number, string>;
  staff: Map<string, string>;
};

async function fetchNames(): Promise<EventNames | null> {
  const [centres, groups, staff] = await Promise.all([
    supabase.from('centres').select('id, name'),
    supabase.from('groups').select('id, name'),
    supabase.rpc('staff_names'),
  ]);
  if (centres.error || groups.error || staff.error) return null;
  return {
    centres: new Map((centres.data as { id: number; name: string }[]).map((c) => [c.id, c.name])),
    groups: new Map((groups.data as { id: number; name: string }[]).map((g) => [g.id, g.name])),
    staff: new Map((staff.data as { id: string; full_name: string }[]).map((s) => [s.id, s.full_name])),
  };
}

/** Where an event is: the centre's name and/or the place typed. */
export function placeText(event: Pick<ClassEvent, 'centreId' | 'place'>, names: EventNames): string {
  const centre = event.centreId !== null ? names.centres.get(event.centreId) : undefined;
  return [centre, event.place].filter(Boolean).join(' · ');
}

/** "04-10-2026 18:30 – 20:00", "04-10-2026 18:30 – 05-10-2026 09:00" or "04-10-2026 18:30" (India time). */
export function whenText(event: Pick<ClassEvent, 'startsAt' | 'endsAt'>): string {
  const start = `${formatDayMonthYear(dateInIndia(event.startsAt))} ${timeInIndia(event.startsAt)}`;
  if (!event.endsAt) return start;
  const sameDay = dateInIndia(event.endsAt) === dateInIndia(event.startsAt);
  const end = sameDay ? timeInIndia(event.endsAt) : `${formatDayMonthYear(dateInIndia(event.endsAt))} ${timeInIndia(event.endsAt)}`;
  return `${start} – ${end}`;
}

async function fetchCounts(ids: number[]): Promise<Map<number, EventCounts> | null> {
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase.rpc('event_counts', { p_ids: ids });
  if (error) return null;
  type Row = {
    event_id: number; addressed: number; going: number; maybe: number; not_going: number; performers: number; attended: number;
    my_response: EventResponse | null; my_part: string | null; i_attended: boolean; can_answer: boolean;
  };
  return new Map(
    (data as Row[]).map((r) => [
      r.event_id,
      {
        addressed: r.addressed, going: r.going, maybe: r.maybe, notGoing: r.not_going, performers: r.performers,
        attended: r.attended, myResponse: r.my_response, myPart: r.my_part, iAttended: r.i_attended, canAnswer: r.can_answer,
      },
    ]),
  );
}

/** One event on a list, with its counts. */
export type EventItem = { event: ClassEvent; counts: EventCounts };

/** The list: upcoming events (soonest first) and past ones of the last 60 days (newest first). */
export type EventList = { upcoming: EventItem[]; past: EventItem[]; names: EventNames };

/**
 * Loads the events the signed-in person may see (row-level security picks them) with their counts
 * and the names to word them. null = could not be loaded (usually no internet).
 */
export async function fetchEvents(): Promise<EventList | null> {
  const since = new Date(Date.now() - PAST_DAYS * 86400_000).toISOString();
  const [events, names] = await Promise.all([
    supabase.from('events').select(EVENT_COLUMNS).gte('starts_at', since).order('starts_at').limit(200),
    fetchNames(),
  ]);
  if (events.error || !names) return null;
  const list = (events.data as EventRow[]).map(toEvent);
  const counts = await fetchCounts(list.map((e) => e.id));
  if (!counts) return null;
  const items = list.map((event) => ({ event, counts: counts.get(event.id) ?? NO_COUNTS }));
  const now = Date.now();
  return {
    upcoming: items.filter((i) => !isOver(i.event, now)),
    past: items.filter((i) => isOver(i.event, now)).reverse(),
    names,
  };
}

/** The next event for the student home (S1 "next event"), not cancelled; null when none. */
export async function fetchNextEvent(): Promise<{ item: EventItem; names: EventNames } | null> {
  const [events, names] = await Promise.all([
    supabase
      .from('events')
      .select(EVENT_COLUMNS)
      .is('cancelled_at', null)
      .gt('starts_at', new Date().toISOString())
      .order('starts_at')
      .limit(1),
    fetchNames(),
  ]);
  if (events.error || !names || events.data.length === 0) return null;
  const event = toEvent((events.data as EventRow[])[0]);
  const counts = await fetchCounts([event.id]);
  return { item: { event, counts: counts?.get(event.id) ?? NO_COUNTS }, names };
}

/** One event with its counts and names. 'not_found' when it is not there (deleted, or not for them). */
export async function fetchEvent(id: number): Promise<{ item: EventItem; names: EventNames } | 'not_found' | null> {
  const [event, names] = await Promise.all([
    supabase.from('events').select(EVENT_COLUMNS).eq('id', id).maybeSingle<EventRow>(),
    fetchNames(),
  ]);
  if (event.error || !names) return null;
  if (!event.data) return 'not_found';
  const counts = await fetchCounts([id]);
  if (!counts) return null;
  return { item: { event: toEvent(event.data), counts: counts.get(id) ?? NO_COUNTS }, names };
}

/** S11: answer Going / Maybe / Not going. */
export async function answerEvent(id: number, response: EventResponse): Promise<{ errorKey?: MessageKey }> {
  const { error } = await supabase.rpc('rsvp_event', { p_event: id, p_response: response });
  return error ? { errorKey: errorKeyOf(error.message) } : {};
}

// ---------------------------------------------------------------- staff (C16)

/** One person an event is for, with their answer (event_people_list). */
export type EventPerson = {
  profileId: string;
  fullName: string;
  rollNo: string | null;
  role: 'guru' | 'coordinator' | 'student';
  response: EventResponse | null;
};

/** Everyone an event is for, by name, with their answer. Staff only; null = could not load. */
export async function fetchEventPeople(id: number): Promise<EventPerson[] | null> {
  const { data, error } = await supabase.rpc('event_people_list', { p_event: id });
  if (error) return null;
  return (
    data as { profile_id: string; full_name: string; roll_no: string | null; role: EventPerson['role']; response: EventResponse | null }[]
  ).map((r) => ({ profileId: r.profile_id, fullName: r.full_name, rollNo: r.roll_no, role: r.role, response: r.response }));
}

/** A student record to pick a performer or attendance from (event_student_list). */
export type EventStudent = {
  studentId: string;
  fullName: string;
  rollNo: string;
  levelId: number;
  hasLogin: boolean;
  inAudience: boolean;
  response: EventResponse | null;
  part: string | null;
  attended: boolean;
};

/** The students the event is for (or every student, `everyone`), with part and attendance. */
export async function fetchEventStudents(id: number, everyone: boolean): Promise<EventStudent[] | null> {
  const { data, error } = await supabase.rpc('event_student_list', { p_event: id, p_everyone: everyone });
  if (error) return null;
  type Row = {
    student_id: string; full_name: string; roll_no: string; level_id: number; has_login: boolean; in_audience: boolean;
    response: EventResponse | null; part: string | null; attended: boolean;
  };
  return (data as Row[]).map((r) => ({
    studentId: r.student_id, fullName: r.full_name, rollNo: r.roll_no, levelId: r.level_id, hasLogin: r.has_login,
    inAudience: r.in_audience, response: r.response, part: r.part, attended: r.attended,
  }));
}

/** Replaces the performers. Returns how many with a login were told. */
export async function savePerformers(
  id: number,
  performers: { studentId: string; part: string }[],
): Promise<{ notified?: number; noLogin?: number; errorKey?: MessageKey }> {
  const { data, error } = await supabase.rpc('set_event_performers', {
    p_event: id,
    p_performers: performers.map((p) => ({ student_id: p.studentId, part: p.part.trim() })),
  });
  if (error) return { errorKey: errorKeyOf(error.message) };
  const r = data as { notified: number; no_login: number };
  return { notified: r.notified, noLogin: r.no_login };
}

/** Replaces the list of students who came. */
export async function saveAttendance(id: number, studentIds: string[]): Promise<{ errorKey?: MessageKey }> {
  const { error } = await supabase.rpc('mark_event_attendance', { p_event: id, p_students: studentIds });
  return error ? { errorKey: errorKeyOf(error.message) } : {};
}

/** Reminds those who have not answered. Returns how many were told. */
export async function remindEvent(id: number): Promise<{ reminded?: number; errorKey?: MessageKey }> {
  const { data, error } = await supabase.rpc('remind_event', { p_event: id });
  return error ? { errorKey: errorKeyOf(error.message) } : { reminded: data as number };
}

/** Cancels an event, with an optional reason; everyone it is for is told. */
export async function cancelEvent(id: number, reason: string): Promise<{ errorKey?: MessageKey }> {
  const { data, error } = await supabase
    .from('events')
    .update({ cancelled_at: new Date().toISOString(), cancel_reason: reason.trim() || null })
    .eq('id', id)
    .select('id');
  if (error) return { errorKey: errorKeyOf(error.message) };
  return data.length === 0 ? { errorKey: 'events.errors.not_allowed' } : {};
}

/** Deletes an event nobody answered yet (else the database says event_has_answers). */
export async function deleteEvent(id: number): Promise<{ errorKey?: MessageKey }> {
  const { data, error } = await supabase.from('events').delete().eq('id', id).select('id');
  if (error) return { errorKey: errorKeyOf(error.message) };
  return data.length === 0 ? { errorKey: 'events.errors.not_allowed' } : {};
}

// ---------------------------------------------------------------- the form (C16 create / edit)

/** The fields of the event form, as typed. Dates day-month-year, times 24-hour, India. */
export type EventForm = {
  title: string;
  description: string;
  date: string;
  time: string;
  /** End time on the same day, or empty for none. */
  endTime: string;
  centreId: number | null;
  place: string;
  audience: Audience | null;
  levelId: number | null;
  groupId: number | null;
};

export type EventFormErrors = Partial<Record<keyof EventForm, MessageKey>>;

export const EMPTY_EVENT_FORM: EventForm = {
  title: '', description: '', date: '', time: '', endTime: '', centreId: null, place: '', audience: null, levelId: null, groupId: null,
};

/** The form filled from an event (to edit it). An end on another day is kept only when unchanged. */
export function formFromEvent(e: ClassEvent): EventForm {
  return {
    title: e.title,
    description: e.description,
    date: formatDayMonthYear(dateInIndia(e.startsAt)),
    time: timeInIndia(e.startsAt),
    endTime: e.endsAt && dateInIndia(e.endsAt) === dateInIndia(e.startsAt) ? timeInIndia(e.endsAt) : '',
    centreId: e.centreId,
    place: e.place ?? '',
    audience: e.audience,
    levelId: e.audienceLevel,
    groupId: e.audienceGroup,
  };
}

/**
 * Checks the form like the database does; returns the problems by field. `savedStart` (editing):
 * an unchanged start may already be past, as the database allows.
 */
export function checkEventForm(form: EventForm, now = Date.now(), savedStart?: string): EventFormErrors {
  const errors: EventFormErrors = {};
  if (!form.title.trim()) errors.title = 'events.errors.title_required';
  else if (form.title.trim().length > EVENT_TITLE_MAX) errors.title = 'events.errors.title_too_long';
  if (form.description.trim().length > EVENT_DESCRIPTION_MAX) errors.description = 'events.errors.description_too_long';
  const date = parseDayMonthYear(form.date);
  const time = parseTimeOfDay(form.time);
  if (!date) errors.date = 'events.form.dateInvalid';
  if (!time) errors.time = 'events.form.timeInvalid';
  if (date && time) {
    const start = Date.parse(momentInIndia(date, time));
    const unchanged = savedStart !== undefined && start === Date.parse(savedStart);
    if (start <= now && !unchanged) errors.date = 'events.errors.starts_past';
    else if (start > now + 365 * 86400_000) errors.date = 'events.errors.starts_too_far';
  }
  if (form.endTime.trim()) {
    const end = parseTimeOfDay(form.endTime);
    if (!end) errors.endTime = 'events.form.timeInvalid';
    else if (time && end <= time) errors.endTime = 'events.errors.ends_invalid';
  }
  if (form.centreId === null && !form.place.trim()) errors.place = 'events.errors.place_required';
  else if (form.place.trim().length > EVENT_PLACE_MAX) errors.place = 'events.errors.place_too_long';
  if (!form.audience) errors.audience = 'events.form.audienceRequired';
  else if (form.audience === 'level' && form.levelId === null) errors.levelId = 'events.errors.level_required';
  else if (form.audience === 'group' && form.groupId === null) errors.groupId = 'events.errors.group_required';
  return errors;
}

/** The row the form saves. `keepEnd` keeps an end on another day that the form does not show. */
function rowOf(form: EventForm, keepEnd: string | null) {
  const date = parseDayMonthYear(form.date) as string;
  const time = parseTimeOfDay(form.time) as string;
  const end = parseTimeOfDay(form.endTime);
  return {
    title: form.title.trim(),
    description: form.description.trim(),
    starts_at: momentInIndia(date, time),
    ends_at: end ? momentInIndia(date, end) : keepEnd,
    centre_id: form.centreId,
    place: form.place.trim() || null,
    audience: form.audience,
    audience_level: form.audience === 'level' ? form.levelId : null,
    audience_group: form.audience === 'group' ? form.groupId : null,
  };
}

/** Creates an event; everyone it is for is told. Returns the new id. */
export async function createEvent(form: EventForm): Promise<{ id?: number; errorKey?: MessageKey }> {
  const { data, error } = await supabase.from('events').insert(rowOf(form, null)).select('id').single<{ id: number }>();
  return error ? { errorKey: errorKeyOf(error.message) } : { id: data.id };
}

/** Saves changes; a new time or place is told to everyone it is for. */
export async function updateEvent(original: ClassEvent, form: EventForm): Promise<{ errorKey?: MessageKey }> {
  const keepEnd =
    original.endsAt && dateInIndia(original.endsAt) !== dateInIndia(original.startsAt) && !form.endTime.trim()
      ? original.endsAt
      : null;
  const row = rowOf(form, keepEnd);
  // The database refuses a start in the past only when it changes; send it only when it does.
  const changes: Partial<typeof row> = { ...row };
  if (Date.parse(row.starts_at) === Date.parse(original.startsAt)) delete changes.starts_at;
  const { data, error } = await supabase.from('events').update(changes).eq('id', original.id).select('id');
  if (error) return { errorKey: errorKeyOf(error.message) };
  return data.length === 0 ? { errorKey: 'events.errors.not_allowed' } : {};
}

/** Active centres for the form, by name. */
export async function fetchActiveCentres(): Promise<{ id: number; name: string }[] | null> {
  const { data, error } = await supabase.from('centres').select('id, name').eq('active', true).order('name');
  return error ? null : (data as { id: number; name: string }[]);
}
