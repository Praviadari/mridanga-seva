// What the student home reads for the level path and the small celebrations (docs/DECISIONS.md #620-#623): the
// student's level, the syllabus of every level with their ticks, their level changes and their practice history.
// No new database function: a student already reads their own students row, student_progress and level_history rows
// (row-level security own_or_staff and own read, 0001), every syllabus item (class role, 0001), and their own practice
// history (practice_history, security invoker, 0056). Read-only: nothing in this file writes.

import { supabase } from '@/lib/supabase';
import type { LevelChange } from '@/lib/celebrations';
import type { PathItem } from '@/lib/level-path';

import { fetchPracticeHistory, type PracticeDays } from './practice';

/** The student's path data. `levelChanges` and `practice` are null when they could not be loaded. */
export type MyPathData = {
  levelId: number;
  /** Items of every level in use, and retired ones the student has ticked. */
  items: PathItem[];
  levelChanges: LevelChange[] | null;
  practice: PracticeDays | null;
};

/**
 * Loads the signed-in student's path data. Null when the login has no student record or the syllabus could not be
 * loaded (usually no internet): the home then shows the count of student_home alone.
 */
export async function fetchMyPath(profileId: string): Promise<MyPathData | null> {
  const me = await supabase
    .from('students')
    .select('id, level_id')
    .eq('profile_id', profileId)
    .maybeSingle<{ id: string; level_id: number }>();
  if (me.error || !me.data) return null;
  const studentId = me.data.id;
  const [items, ticks, changes, practice] = await Promise.all([
    supabase.from('syllabus_items').select('id, level_id, sort, title, retired_at').order('level_id').order('sort'),
    supabase.from('student_progress').select('item_id, done_on').eq('student_id', studentId),
    supabase.from('level_history').select('id, from_level, to_level, changed_on').eq('student_id', studentId),
    fetchPracticeHistory(studentId),
  ]);
  if (items.error || ticks.error) return null;
  const doneOn = new Map((ticks.data as { item_id: number; done_on: string }[]).map((tick) => [tick.item_id, tick.done_on]));
  return {
    levelId: me.data.level_id,
    items: (items.data as { id: number; level_id: number; sort: number; title: string; retired_at: string | null }[]).flatMap(
      (item) => {
        const on = doneOn.get(item.id) ?? null;
        if (item.retired_at && !on) return [];
        return [{ id: item.id, levelId: item.level_id, sort: item.sort, title: item.title, doneOn: on, retired: item.retired_at !== null }];
      },
    ),
    levelChanges: changes.error
      ? null
      : (changes.data as { id: number; from_level: number | null; to_level: number; changed_on: string }[]).map((c) => ({
          id: c.id,
          fromLevel: c.from_level,
          toLevel: c.to_level,
          changedOn: c.changed_on,
        })),
    practice,
  };
}
