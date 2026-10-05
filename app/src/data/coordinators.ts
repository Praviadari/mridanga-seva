// Coordinators and roles (screen G2, the Guru only): the coordinators with their mentees and duty
// hours, the people who signed up and wait for a role, and the switched-off logins. The Guru
// makes someone a coordinator or links them to a student record, switches a login off or on,
// writes duty hours and moves mentees to another coordinator.
// The rules are in the database (supabase/migrations/0014_guru_admin.sql, docs/DECISIONS.md #45):
// nobody changes their own role, the Guru role stays a dashboard matter, a coordinator who still
// mentors students stays on, and a student's open call tasks follow their mentor.
// The Guru also marks coordinators as Ishtagoshti editors (profiles.ig_editor, migration 0021,
// docs/DECISIONS.md #57): they may add and edit slokas and themes. And treasurers of the class fund
// (profiles.is_treasurer, migration 0026, docs/DECISIONS.md #80): they record fund entries.

import type { ParseKeys } from 'i18next';

import { supabase } from '@/lib/supabase';

import { isNetworkError } from './errors';
import type { StudentStatus } from './student-overview';

type MessageKey = ParseKeys;

/** A login as G2 shows it. */
export type Person = {
  id: string;
  role: 'pending' | 'guru' | 'coordinator' | 'student' | 'kiosk';
  fullName: string;
  email: string | null;
  phone: string | null;
  dutyHours: string | null;
  active: boolean;
  createdAt: string;
  /** Ishtagoshti editor; null = not known (the database has no such column yet, before 0021). */
  igEditor: boolean | null;
  /** Treasurer of the class fund (profiles.is_treasurer; used from migration 0026, docs/DECISIONS.md #80). */
  treasurer: boolean;
};

/** A student as the mentee lists and the link picker show them. */
export type MenteeRow = {
  id: string;
  fullName: string;
  rollNo: string;
  levelId: number;
  status: StudentStatus;
  mentorId: string | null;
  /** True when the record already has an app login. */
  hasLogin: boolean;
};

/** Everything G2 shows. */
export type CoordinatorsBoard = {
  /** The Guru and the coordinators, active ones first, then by name. */
  staff: Person[];
  /** Logins waiting for a role (active pending ones), newest first. */
  waiting: Person[];
  /** Switched-off logins that are not staff (pending ones the Guru put aside). */
  setAside: Person[];
  students: MenteeRow[];
};

type PersonRow = {
  id: string;
  role: Person['role'];
  full_name: string;
  email: string | null;
  phone: string | null;
  duty_hours: string | null;
  is_treasurer: boolean;
  active: boolean;
  created_at: string;
};

function toPerson(row: PersonRow): Person {
  return {
    id: row.id,
    role: row.role,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    dutyHours: row.duty_hours,
    active: row.active,
    createdAt: row.created_at,
    igEditor: null,
    treasurer: row.is_treasurer,
  };
}

/** Loads the board. Returns null when it could not be loaded (usually no internet). */
export async function fetchCoordinatorsBoard(): Promise<CoordinatorsBoard | null> {
  const [people, students, editors, subscribers] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, role, full_name, email, phone, duty_hours, is_treasurer, active, created_at')
      .in('role', ['guru', 'coordinator', 'pending'])
      .order('full_name'),
    supabase.from('students').select('id, full_name, roll_no, level_id, status, mentor_id, profile_id').order('full_name'),
    // Asked apart, so the page still works on a database without migration 0021.
    supabase.from('profiles').select('id, ig_editor').eq('role', 'coordinator'),
    // Public Ishtagoshti subscribers are not waiting for a class role: they are on I15 (0027,
    // docs/DECISIONS.md #88). Asked apart, so the page still works without migration 0027.
    supabase.from('ig_subscribers').select('profile_id'),
  ]);
  if (people.error || students.error) return null;
  const editorOf = editors.error ? null : new Map((editors.data as { id: string; ig_editor: boolean }[]).map((e) => [e.id, e.ig_editor]));
  const all = (people.data as PersonRow[]).map(toPerson).map((p) => ({ ...p, igEditor: editorOf?.get(p.id) ?? null }));
  const staff = all
    .filter((p) => p.role === 'guru' || p.role === 'coordinator')
    .sort((a, b) => Number(b.active) - Number(a.active) || a.fullName.localeCompare(b.fullName));
  const subscriberIds = new Set(subscribers.error ? [] : (subscribers.data as { profile_id: string }[]).map((s) => s.profile_id));
  const pending = all.filter((p) => p.role === 'pending' && !subscriberIds.has(p.id));
  return {
    staff,
    waiting: pending.filter((p) => p.active).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    setAside: pending.filter((p) => !p.active),
    students: (
      students.data as {
        id: string;
        full_name: string;
        roll_no: string;
        level_id: number;
        status: StudentStatus;
        mentor_id: string | null;
        profile_id: string | null;
      }[]
    ).map((s) => ({
      id: s.id,
      fullName: s.full_name,
      rollNo: s.roll_no,
      levelId: s.level_id,
      status: s.status,
      mentorId: s.mentor_id,
      hasLogin: s.profile_id !== null,
    })),
  };
}

/** Loads one login with the board, for the person page. Null = could not load; 'not_found'. */
export async function fetchPerson(id: string): Promise<{ person: Person; board: CoordinatorsBoard } | 'not_found' | null> {
  const board = await fetchCoordinatorsBoard();
  if (!board) return null;
  const person = [...board.staff, ...board.waiting, ...board.setAside].find((p) => p.id === id);
  return person ? { person, board } : 'not_found';
}

// ---------------------------------------------------------------- changes

/** Result of a change: nothing = done; otherwise the message to show. */
export type ChangeResult = { errorKey?: MessageKey };

/** Makes a waiting person a coordinator. */
export async function makeCoordinator(id: string): Promise<ChangeResult> {
  return asResult(await supabase.from('profiles').update({ role: 'coordinator' }).eq('id', id).select('id'));
}

/** Switches a login off (it keeps nothing but the pending screen) or on again. */
export async function setActive(id: string, active: boolean): Promise<ChangeResult> {
  return asResult(await supabase.from('profiles').update({ active }).eq('id', id).select('id'));
}

/** Saves a coordinator's duty hours (empty = none). */
export async function saveDutyHours(id: string, dutyHours: string): Promise<ChangeResult> {
  if (dutyHours.trim().length > 120) return { errorKey: 'coordinators.errors.duty_hours_too_long' };
  return asResult(await supabase.from('profiles').update({ duty_hours: dutyHours.trim() || null }).eq('id', id).select('id'));
}

/** Lets a coordinator add and edit Ishtagoshti slokas and themes, or takes that away. */
export async function setIgEditor(id: string, on: boolean): Promise<ChangeResult> {
  return asResult(await supabase.from('profiles').update({ ig_editor: on }).eq('id', id).select('id'));
}

/** Makes a coordinator a treasurer of the class fund (records entries, approves the Guru's own), or takes that away. */
export async function setTreasurer(id: string, on: boolean): Promise<ChangeResult> {
  return asResult(await supabase.from('profiles').update({ is_treasurer: on }).eq('id', id).select('id'));
}

/** Links a waiting person to a student record without a login; they become that student. */
export async function linkToStudent(profileId: string, studentId: string): Promise<ChangeResult> {
  const { error } = await supabase.rpc('link_student_login', { p_profile: profileId, p_student: studentId });
  return error ? { errorKey: errorKeyOf(error.message) } : {};
}

/** Moves students to another mentor. Returns how many moved, or the message. */
export async function moveMentees(studentIds: readonly string[], toId: string): Promise<{ moved?: number; errorKey?: MessageKey }> {
  const { data, error } = await supabase.rpc('reassign_mentees', { p_students: studentIds, p_to: toId });
  return error ? { errorKey: errorKeyOf(error.message) } : { moved: data as number };
}

/** An update that row-level security turned into "nothing changed" means not allowed. */
function asResult(response: { data: unknown[] | null; error: { message: string } | null }): ChangeResult {
  if (response.error) return { errorKey: errorKeyOf(response.error.message) };
  if (!response.data || response.data.length === 0) return { errorKey: 'coordinators.errors.not_allowed' };
  return {};
}

/** Error codes of migration 0014 (and 0002's guard) that have their own message. */
const KNOWN_ERRORS = [
  'not_allowed',
  'not_own_role',
  'guru_role_dashboard_only',
  'role_change_not_allowed',
  'student_needs_record',
  'has_mentees',
  'duty_hours_too_long',
  'profile_not_pending',
  'student_not_found',
  'student_already_linked',
  'mentor_not_staff',
  'ig_editor_coordinator_only',
  'treasurer_coordinator_only',
] as const;

function errorKeyOf(message: string): MessageKey {
  const code = (KNOWN_ERRORS as readonly string[]).find((c) => message === c);
  if (code) return `coordinators.errors.${code as (typeof KNOWN_ERRORS)[number]}`;
  if (message.startsWith('only the Guru')) return 'coordinators.errors.not_allowed';
  if (isNetworkError(message)) return 'common.networkError';
  return 'common.genericError';
}
