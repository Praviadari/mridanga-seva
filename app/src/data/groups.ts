// Groups, for coordinators and the Guru (screens staff/groups): the list with member counts,
// making a group, renaming it, switching it off or on, and adding or removing members. A group
// is who gets an announcement sent to "A group" (C15); groups replace the class WhatsApp groups.
//
// The app writes groups and group_members directly. Row-level security lets only staff change
// them and shows a group only to staff and its own members; a trigger checks the name and purpose
// (supabase/migrations/0008_announcement_follow_ups.sql, docs/DECISIONS.md #28). Groups are
// switched off, never deleted, so old announcements keep their group.

import type { ParseKeys } from 'i18next';

import type { AppRole } from '@/auth/types';
import { searchFold } from '@/lib/search-text';
import { supabase } from '@/lib/supabase';

import { isNetworkError } from './errors';

/** A translation key for a message. */
type MessageKey = ParseKeys;

/** Longest group name the database accepts, in characters (same limit as the trigger in 0008). */
export const GROUP_NAME_MAX_LENGTH = 60;
/** Longest purpose the database accepts, in characters (same limit as the trigger in 0008). */
export const GROUP_PURPOSE_MAX_LENGTH = 200;

/** One group, with how many people are in it. */
export type GroupSummary = {
  id: number;
  name: string;
  /** What the group is for, or null. */
  purpose: string | null;
  /** False = switched off: no longer offered when posting an announcement. */
  active: boolean;
  members: number;
};

type GroupRow = { id: number; name: string; purpose: string | null; active: boolean; members: number };

/**
 * Loads every group, active ones first, then by name, with member counts (view group_summary,
 * counted in the database). Returns null when they could not be loaded (usually no internet).
 */
export async function fetchGroups(): Promise<GroupSummary[] | null> {
  const { data, error } = await supabase
    .from('group_summary')
    .select('id, name, purpose, active, members')
    .order('active', { ascending: false })
    .order('name');
  if (error) return null;
  return data as GroupRow[];
}

// ---------------------------------------------------------------- name and purpose

/** The name and purpose, as typed. */
export type GroupForm = { name: string; purpose: string };

/** An empty form for a new group. */
export const EMPTY_GROUP_FORM: GroupForm = { name: '', purpose: '' };

/** A problem with one field, as the key of the message to show under it. */
export type GroupFormErrors = Partial<Record<keyof GroupForm, MessageKey>>;

/** What happened when a group was saved; `errors` or `errorKey` mean nothing was saved. */
export type GroupSaveOutcome = { id?: number; errors?: GroupFormErrors; errorKey?: MessageKey };

/** Checks the form before it is sent. The database checks again (0008). */
export function checkGroupForm(form: GroupForm): GroupFormErrors {
  const errors: GroupFormErrors = {};
  const name = form.name.trim();
  if (!name) errors.name = 'groups.errors.nameRequired';
  else if (name.length > GROUP_NAME_MAX_LENGTH) errors.name = 'groups.errors.nameTooLong';
  if (form.purpose.trim().length > GROUP_PURPOSE_MAX_LENGTH) errors.purpose = 'groups.errors.purposeTooLong';
  return errors;
}

/** The columns the form writes. An empty purpose is saved as none. */
function columnsOf(form: GroupForm) {
  return { name: form.name.trim(), purpose: form.purpose.trim() || null };
}

/**
 * Makes a new, active group with no members. The database records who made it. Returns its id.
 * Call only after checkGroupForm found no problems.
 */
export async function createGroup(form: GroupForm): Promise<GroupSaveOutcome> {
  const { data, error } = await supabase.from('groups').insert(columnsOf(form)).select('id').single();
  if (error) return groupSaveError(error.message, error.code);
  return { id: (data as { id: number }).id };
}

/** Renames a group or changes its purpose. Call only after checkGroupForm found no problems. */
export async function saveGroupDetails(id: number, form: GroupForm): Promise<GroupSaveOutcome> {
  const { data, error } = await supabase.from('groups').update(columnsOf(form)).eq('id', id).select('id');
  if (error) return groupSaveError(error.message, error.code);
  return data.length === 0 ? { errorKey: 'groups.errors.cannotChange' } : { id };
}

/**
 * Switches a group off (it is no longer offered when posting; old announcements keep it) or on
 * again. Members stay either way.
 */
export async function setGroupActive(id: number, active: boolean): Promise<{ errorKey?: MessageKey }> {
  const { data, error } = await supabase.from('groups').update({ active }).eq('id', id).select('id');
  if (error) return { errorKey: groupErrorKey(error.message, error.code) };
  return data.length === 0 ? { errorKey: 'groups.errors.cannotChange' } : {};
}

// ---------------------------------------------------------------- members

/** A person who can be in a group: a student with a login, a coordinator or the Guru. */
export type GroupPerson = {
  profileId: string;
  /** Name on the student record for students, the login's name for staff. */
  fullName: string;
  /** Roll number for students, else null. */
  rollNo: string | null;
  /** The login's role; a member whose role has changed since may be 'pending' or 'kiosk'. */
  role: AppRole;
  /** False when the login has been switched off. */
  active: boolean;
};

/** Everything one group's screen shows. */
export type GroupDetail = {
  group: GroupSummary;
  /** Its members, by name. */
  members: GroupPerson[];
  /** Everyone who could be added: active student logins and staff who are not members yet, by name. */
  candidates: GroupPerson[];
};

/** Roles whose members receive group announcements (the rule in announcement_audience, 0007). */
const MEMBER_ROLES: readonly AppRole[] = ['guru', 'coordinator', 'student'];

/**
 * Loads one group with its members and the people who could be added. Returns 'not_found' when
 * the group is not there, null when it could not be loaded.
 *
 * Everyone comes in one go and the search filters on the phone, as on the student list: fine for
 * a class of a few hundred (Supabase returns at most 1,000 rows per request).
 */
export async function fetchGroup(id: number): Promise<GroupDetail | 'not_found' | null> {
  const [group, memberRows, profiles, students] = await Promise.all([
    supabase.from('group_summary').select('id, name, purpose, active, members').eq('id', id).maybeSingle(),
    supabase.from('group_members').select('profile_id').eq('group_id', id),
    supabase.from('profiles').select('id, full_name, role, active'),
    supabase.from('students').select('profile_id, full_name, roll_no').not('profile_id', 'is', null),
  ]);
  if (group.error || memberRows.error || profiles.error || students.error) return null;
  if (!group.data) return 'not_found';

  const studentOf = new Map(
    (students.data as { profile_id: string; full_name: string; roll_no: string }[]).map((s) => [s.profile_id, s]),
  );
  const people = (profiles.data as { id: string; full_name: string; role: AppRole; active: boolean }[]).map(
    (p): GroupPerson => {
      const student = studentOf.get(p.id);
      return {
        profileId: p.id,
        fullName: student?.full_name ?? p.full_name,
        rollNo: student?.roll_no ?? null,
        role: p.role,
        active: p.active,
      };
    },
  );
  const memberIds = new Set((memberRows.data as { profile_id: string }[]).map((m) => m.profile_id));
  const byName = (a: GroupPerson, b: GroupPerson) => a.fullName.localeCompare(b.fullName);
  return {
    group: group.data as GroupRow,
    members: people.filter((p) => memberIds.has(p.profileId)).sort(byName),
    candidates: people
      .filter((p) => !memberIds.has(p.profileId) && p.active && MEMBER_ROLES.includes(p.role))
      .sort(byName),
  };
}

/**
 * True when the person matches the search text: part of the name or of the roll number. An empty
 * search matches nobody, so the screen does not list the whole class at once.
 */
export function matchesPersonSearch(person: GroupPerson, search: string): boolean {
  const query = searchFold(search);
  if (!query) return false;
  return searchFold(person.fullName).includes(query) || (person.rollNo ?? '').toLowerCase().includes(query);
}

/** Adds a person to a group. Adding someone who is already in it changes nothing. */
export async function addMember(groupId: number, profileId: string): Promise<{ errorKey?: MessageKey }> {
  const { error } = await supabase.from('group_members').insert({ group_id: groupId, profile_id: profileId });
  // 23505 = already a member (another phone added them meanwhile): the same result.
  if (error && error.code !== '23505') return { errorKey: groupErrorKey(error.message, error.code) };
  return {};
}

/** Takes a person out of a group. They stop receiving its announcements. */
export async function removeMember(groupId: number, profileId: string): Promise<{ errorKey?: MessageKey }> {
  const { error } = await supabase.from('group_members').delete().eq('group_id', groupId).eq('profile_id', profileId);
  if (error) return { errorKey: groupErrorKey(error.message, error.code) };
  return {};
}

// ---------------------------------------------------------------- errors

/** A save error: problems with the name or purpose go under that field, the rest above the button. */
function groupSaveError(message: string, code: string | undefined): GroupSaveOutcome {
  const key = groupErrorKey(message, code);
  if (key === 'groups.errors.nameRequired' || key === 'groups.errors.nameTooLong' || key === 'groups.errors.nameTaken') {
    return { errors: { name: key } };
  }
  if (key === 'groups.errors.purposeTooLong') return { errors: { purpose: key } };
  return { errorKey: key };
}

/** Turns a database error into a translation key. Codes: migration 0008. */
function groupErrorKey(message: string, code: string | undefined): MessageKey {
  switch (message) {
    case 'group_name_required':
      return 'groups.errors.nameRequired';
    case 'group_name_too_long':
      return 'groups.errors.nameTooLong';
    case 'group_purpose_too_long':
      return 'groups.errors.purposeTooLong';
  }
  // 23505 = another group already has this name (the capitals do not matter).
  if (code === '23505') return 'groups.errors.nameTaken';
  // 42501 = refused by row-level security: the person is not a coordinator or the Guru.
  if (code === '42501') return 'groups.errors.notAllowed';
  if (isNetworkError(message)) return 'common.networkError';
  return 'common.genericError';
}
