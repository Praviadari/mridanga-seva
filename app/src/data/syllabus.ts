// Syllabus tick-off (screen C9): the syllabus of each level in teaching order, which items one
// student has shown in class, and ticking, unticking and remarks. Staff only.
//
// A tick is one row in student_progress: insert = tick, update = change the remark, delete =
// untick. Row-level security lets only coordinators and the Guru write it, and a database trigger
// records who really ticked and refuses a date in the future; every change is kept in the audit
// log (supabase/migrations/0006_syllabus_progress.sql, docs/DECISIONS.md #22).

import type { ParseKeys } from 'i18next';

import { supabase } from '@/lib/supabase';

import { isNetworkError } from './errors';

/** A translation key for a message. */
type MessageKey = ParseKeys;

/** Longest remark the database accepts, in characters (same limit as the trigger in 0006). */
export const REMARK_MAX_LENGTH = 500;

/** One syllabus item, with the student's tick if there is one. */
export type SyllabusEntry = {
  id: number;
  levelId: number;
  /** Position in the level's teaching order, 1 first. */
  sort: number;
  title: string;
  description: string | null;
  /** 'YYYY-MM-DD' the student showed it in class, or null while not ticked. */
  doneOn: string | null;
  /** Profile id of the coordinator or Guru who ticked it. */
  tickedBy: string | null;
  remark: string | null;
};

/** The student the tick-off screen is for. */
export type SyllabusStudent = { id: string; fullName: string; rollNo: string; levelId: number };

/** Everything the tick-off screen shows. */
export type StudentSyllabus = {
  student: SyllabusStudent;
  /** Items of every level, ordered by level and then teaching order. */
  items: SyllabusEntry[];
};

/**
 * Loads the student and every level's syllabus with the student's ticks. Returns 'not_found'
 * when there is no such student (or the person may not see them), and null when it could not be
 * loaded (usually no internet). All levels are read, not only the student's own, so that items
 * of an earlier level that were never ticked can still be caught up. The whole syllabus is a few
 * dozen rows.
 */
export async function fetchStudentSyllabus(studentId: string): Promise<StudentSyllabus | 'not_found' | null> {
  const [student, items, ticks] = await Promise.all([
    supabase.from('students').select('id, full_name, roll_no, level_id').eq('id', studentId).maybeSingle(),
    supabase
      .from('syllabus_items')
      .select('id, level_id, sort, title, description')
      .order('level_id')
      .order('sort'),
    supabase.from('student_progress').select('item_id, done_on, ticked_by, remark').eq('student_id', studentId),
  ]);
  if (student.error || items.error || ticks.error) return null;
  if (!student.data) return 'not_found';

  const s = student.data as { id: string; full_name: string; roll_no: string; level_id: number };
  const byItem = new Map(
    (ticks.data as { item_id: number; done_on: string; ticked_by: string | null; remark: string | null }[]).map(
      (tick) => [tick.item_id, tick],
    ),
  );
  return {
    student: { id: s.id, fullName: s.full_name, rollNo: s.roll_no, levelId: s.level_id },
    items: (
      items.data as { id: number; level_id: number; sort: number; title: string; description: string | null }[]
    ).map((item) => {
      const tick = byItem.get(item.id);
      return {
        id: item.id,
        levelId: item.level_id,
        sort: item.sort,
        title: item.title,
        description: item.description,
        doneOn: tick?.done_on ?? null,
        tickedBy: tick?.ticked_by ?? null,
        remark: tick?.remark ?? null,
      };
    }),
  };
}

/**
 * What happened when a tick was changed. `notice` is a harmless surprise, e.g. another
 * coordinator ticked the same item a moment earlier; `errorKey` means nothing was saved. Either
 * way the screen should load the list again.
 */
export type TickOutcome = { notice?: MessageKey; errorKey?: MessageKey };

/**
 * Ticks an item for a student, dated today; the database records the signed-in person as the one
 * who ticked it. `remark` is optional (empty = none).
 */
export async function tickItem(studentId: string, itemId: number, remark: string): Promise<TickOutcome> {
  const { error } = await supabase
    .from('student_progress')
    .insert({ student_id: studentId, item_id: itemId, remark: remark.trim() || null });
  // 23505 = the row exists already: someone else ticked it first. Their tick is kept as it is,
  // so their date and remark are not overwritten by this phone.
  if (error?.code === '23505') return { notice: 'syllabus.alreadyTicked' };
  return error ? { errorKey: syllabusErrorKey(error.message, error.code) } : {};
}

/** Removes a student's tick. The audit log keeps who had ticked it and when. */
export async function untickItem(studentId: string, itemId: number): Promise<TickOutcome> {
  const { data, error } = await supabase
    .from('student_progress')
    .delete()
    .eq('student_id', studentId)
    .eq('item_id', itemId)
    .select('item_id');
  if (error) return { errorKey: syllabusErrorKey(error.message, error.code) };
  // Row-level security turns a delete the person may not make into "nothing deleted", so an
  // empty answer means either another phone unticked it first or this person may not untick.
  return data.length === 0 ? { notice: 'syllabus.alreadyUnticked' } : {};
}

/** Replaces the remark on a tick (empty = remove it). Date and ticker stay as they were. */
export async function saveRemark(studentId: string, itemId: number, remark: string): Promise<TickOutcome> {
  const { data, error } = await supabase
    .from('student_progress')
    .update({ remark: remark.trim() || null })
    .eq('student_id', studentId)
    .eq('item_id', itemId)
    .select('item_id');
  if (error) return { errorKey: syllabusErrorKey(error.message, error.code) };
  return data.length === 0 ? { errorKey: 'syllabus.errors.gone' } : {};
}

/** Turns a database error from the calls above into a translation key. */
function syllabusErrorKey(message: string, code: string | undefined): MessageKey {
  if (message === 'remark_too_long') return 'syllabus.errors.remarkTooLong';
  if (message === 'done_on_future' || message === 'progress_frozen') return 'common.genericError';
  // 42501 = refused by row-level security: the person is not a coordinator or the Guru.
  if (code === '42501') return 'syllabus.errors.notAllowed';
  // 23503 = the item or student was deleted meanwhile (for example the Guru edited the syllabus).
  if (code === '23503') return 'syllabus.errors.gone';
  if (isNetworkError(message)) return 'common.networkError';
  return 'common.genericError';
}
