// Syllabus tick-off (screen C9): the syllabus of each level in teaching order, which items one
// student has shown in class, and ticking, unticking and remarks. Staff only.
//
// A tick is one row in student_progress: insert = tick, update = change the remark, delete =
// untick. Row-level security lets only coordinators and the Guru write it, and a database trigger
// records who really ticked and refuses a date in the future; every change is kept in the audit
// log (supabase/migrations/0006_syllabus_progress.sql, docs/DECISIONS.md #22).

import { supabase } from '@/lib/supabase';

import { fallbackErrorKey, type MessageKey } from './errors';
import { fetchMaterials, type Material } from './materials';

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
  /**
   * True for an item the Guru retired (G4, docs/DECISIONS.md #44). It is listed only when this
   * student has it ticked, cannot be ticked again, and does not count in progress.
   */
  retired: boolean;
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
 * dozen rows. Retired items are left out unless the student has them ticked.
 */
export async function fetchStudentSyllabus(studentId: string): Promise<StudentSyllabus | 'not_found' | null> {
  const [student, items, ticks] = await Promise.all([
    supabase.from('students').select('id, full_name, roll_no, level_id').eq('id', studentId).maybeSingle(),
    supabase
      .from('syllabus_items')
      .select('id, level_id, sort, title, description, retired_at')
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
      items.data as {
        id: number;
        level_id: number;
        sort: number;
        title: string;
        description: string | null;
        retired_at: string | null;
      }[]
    ).flatMap((item) => {
      const tick = byItem.get(item.id);
      if (item.retired_at && !tick) return [];
      return [
        {
          id: item.id,
          levelId: item.level_id,
          sort: item.sort,
          title: item.title,
          description: item.description,
          doneOn: tick?.done_on ?? null,
          tickedBy: tick?.ticked_by ?? null,
          remark: tick?.remark ?? null,
          retired: item.retired_at !== null,
        },
      ];
    }),
  };
}

/** How many of `items` are in use and how many of those are ticked; retired items do not count. */
export function progressCount(items: readonly SyllabusEntry[]): { done: number; total: number } {
  const inUse = items.filter((item) => !item.retired);
  return { done: inUse.filter((item) => item.doneOn).length, total: inUse.length };
}

/** The signed-in student's own progress (screen S4 My progress). */
export type MyProgress = {
  levelId: number;
  /** The items of the student's current level in teaching order, with their ticks. */
  items: SyllabusEntry[];
  done: number;
  /** Items in use (retired ones listed because they are ticked do not count). */
  total: number;
  /** The lessons and materials of the level, for one item or for the whole level (S4 since round 7). */
  materials: Material[];
};

/**
 * Loads the signed-in student's own level and its syllabus with their ticks and its materials,
 * for S4. Row-level security lets a student read only their own students and student_progress
 * rows (policy own_or_staff, supabase/migrations/0001_phase1.sql), everyone reads
 * syllabus_items, and a student reads the approved materials up to their own level. Returns
 * 'not_found' when the login has no student record, null when it could not be loaded.
 */
export async function fetchMyProgress(profileId: string): Promise<MyProgress | 'not_found' | null> {
  const me = await supabase.from('students').select('id').eq('profile_id', profileId).maybeSingle<{ id: string }>();
  if (me.error) return null;
  if (!me.data) return 'not_found';
  const all = await fetchStudentSyllabus(me.data.id);
  if (all === null) return null;
  if (all === 'not_found') return 'not_found';
  const materials = await fetchMaterials(all.student.levelId);
  if (materials === null) return null;
  const items = all.items.filter((item) => item.levelId === all.student.levelId);
  return { levelId: all.student.levelId, items, ...progressCount(items), materials };
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
  if (message === 'item_retired') return 'syllabus.errors.retired';
  if (message === 'done_on_future' || message === 'progress_frozen') return 'common.genericError';
  // 42501 = refused by row-level security: the person is not a coordinator or the Guru.
  if (code === '42501') return 'syllabus.errors.notAllowed';
  // 23503 = the item or student was deleted meanwhile (for example the Guru edited the syllabus).
  if (code === '23503') return 'syllabus.errors.gone';
  return fallbackErrorKey(message);
}
