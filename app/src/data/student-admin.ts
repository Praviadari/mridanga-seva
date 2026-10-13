// The Guru's changes to one student record from its profile (C8; audit R3-01..03, docs/DECISIONS.md #302):
// give or change the mentor (reassign_mentees, migration 0014), set the level and joining date after
// Accept made them Beginner / today (a direct update the database allows the Guru only: guard_student_level
// 0017, level_history written by note_level_change 0025), and take a wrong login off the record
// (unlink_student_login, 0025: the login goes back to waiting). No migration: the rules were all there.
// Since 0062 (audit R3-04, #326): delete a record entered by mistake (delete_student_record), refused when
// anything hangs on it.

import { supabase } from '@/lib/supabase';
import type { LevelPatch } from '@/lib/guru-tools';

import { moveMentees } from './coordinators';
import { fallbackErrorKey, type MessageKey } from './errors';

/** Result of a change: nothing = done; otherwise the message to show. */
export type AdminResult = { errorKey?: MessageKey };

/** Error codes of these changes that have their own message (studentTools.errors.*). */
const KNOWN_ERRORS = [
  'not_allowed',
  'level_guru_only',
  'joined_on_invalid',
  'mentor_not_staff',
  'student_not_found',
  'student_not_linked',
  'student_linked',
  'student_visited',
  'student_has_history',
  'reason_required',
  'reason_too_long',
] as const;

/** The message for an error of these changes. */
export function studentAdminErrorKey(message: string): MessageKey {
  const code = (KNOWN_ERRORS as readonly string[]).find((c) => message === c);
  if (code) return `studentTools.errors.${code as (typeof KNOWN_ERRORS)[number]}`;
  if (message.startsWith('only the Guru')) return 'studentTools.errors.not_allowed';
  return fallbackErrorKey(message);
}

/** Gives the student a mentor (the Guru only; also for a student without one). */
export async function setMentor(studentId: string, mentorId: string): Promise<AdminResult> {
  const result = await moveMentees([studentId], mentorId);
  return result.errorKey ? { errorKey: result.errorKey } : {};
}

/** Saves the level and / or joining date (the Guru only). An update that changed no row means not allowed. */
export async function setLevel(studentId: string, patch: LevelPatch): Promise<AdminResult> {
  const { data, error } = await supabase.from('students').update(patch).eq('id', studentId).select('id');
  if (error) return { errorKey: studentAdminErrorKey(error.message) };
  return data && data.length > 0 ? {} : { errorKey: 'studentTools.errors.not_allowed' };
}

/**
 * Deletes a record entered by mistake, such as a second copy of a student (the Guru only, with a reason;
 * #326). The database refuses it when the record has a login, a visit or anything recorded about the student.
 */
export async function deleteStudentRecord(studentId: string, reason: string): Promise<AdminResult> {
  const { error } = await supabase.rpc('delete_student_record', { p_student: studentId, p_reason: reason.trim() });
  if (!error) return {};
  // A withdrawn record stays: erasure is a separate step, so this refusal has its own words here.
  if (error.message === 'student_withdrawn') return { errorKey: 'studentTools.errors.student_withdrawn' };
  return { errorKey: studentAdminErrorKey(error.message) };
}

/** Takes the app login off the record (the Guru only); the login goes back to waiting for a role. */
export async function unlinkLogin(studentId: string): Promise<AdminResult> {
  const { error } = await supabase.rpc('unlink_student_login', { p_student: studentId });
  return error ? { errorKey: studentAdminErrorKey(error.message) } : {};
}
