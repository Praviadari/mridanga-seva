// G4 Levels and syllabus editor: the three levels (Beginner, Intermediate, Advanced) and the
// syllabus items of each in teaching order, so the team can enter the real syllabus themselves.
// The Guru adds, edits, reorders, retires and deletes items; coordinators see the same screens
// read-only. Levels themselves are fixed (Praveen's decision of 28-09-2026).
//
// Ticks already given (C9) always survive: editing an item keeps its ticks, an item with ticks
// can only be retired (no longer taught, cannot be ticked, not counted), never deleted. The
// database enforces this however a row is written (migration 0013_syllabus_materials.sql,
// docs/DECISIONS.md #44); the screen offers only what is allowed.

import { LEVEL_IDS } from '@/i18n/labels';
import { supabase } from '@/lib/supabase';

import { fallbackErrorKey, type MessageKey } from './errors';

/** Longest title and description, as in the database. */
export const ITEM_TITLE_MAX = 120;
export const ITEM_DESCRIPTION_MAX = 1000;

/** The levels, in order (i18n/labels.ts, with their names). */
export { LEVEL_IDS };

/** One syllabus item as the editor shows it. */
export type EditorItem = {
  id: number;
  levelId: number;
  sort: number;
  title: string;
  description: string | null;
  /** ISO time it was retired, or null while it is taught. */
  retiredAt: string | null;
  /** How many students have it ticked. */
  ticks: number;
  /** How many materials point to it. */
  materials: number;
};

/** One level with its items in use and its retired ones. */
export type LevelSyllabus = { levelId: number; items: EditorItem[]; retired: EditorItem[] };

/**
 * Loads the syllabus of every level with tick and material counts (syllabus_item_counts() in
 * 0013 counts them in the database). Staff only. null = could not be loaded.
 */
export async function fetchSyllabusByLevel(): Promise<LevelSyllabus[] | null> {
  const [items, counts] = await Promise.all([
    supabase.from('syllabus_items').select('id, level_id, sort, title, description, retired_at').order('level_id').order('sort'),
    supabase.rpc('syllabus_item_counts'),
  ]);
  if (items.error || counts.error) return null;
  const byItem = new Map(
    (counts.data as { item_id: number; ticks: number; materials: number }[]).map((c) => [c.item_id, c]),
  );
  const all = (
    items.data as {
      id: number;
      level_id: number;
      sort: number;
      title: string;
      description: string | null;
      retired_at: string | null;
    }[]
  ).map(
    (row): EditorItem => ({
      id: row.id,
      levelId: row.level_id,
      sort: row.sort,
      title: row.title,
      description: row.description,
      retiredAt: row.retired_at,
      ticks: byItem.get(row.id)?.ticks ?? 0,
      materials: byItem.get(row.id)?.materials ?? 0,
    }),
  );
  return LEVEL_IDS.map((levelId) => ({
    levelId,
    items: all.filter((item) => item.levelId === levelId && !item.retiredAt),
    retired: all.filter((item) => item.levelId === levelId && item.retiredAt),
  }));
}

/** The result of a change: nothing = done; `errorKey` = nothing was changed. */
export type EditOutcome = { errorKey?: MessageKey; id?: number };

/** Problems with the item form, per field. Empty = fine. */
export type ItemFormErrors = Partial<Record<'title' | 'description', MessageKey>>;

/** Checks an item before saving; the database checks the same. */
export function checkItemForm(title: string, description: string): ItemFormErrors {
  const errors: ItemFormErrors = {};
  if (!title.trim()) errors.title = 'syllabusEditor.errors.titleRequired';
  else if (title.trim().length > ITEM_TITLE_MAX) errors.title = 'syllabusEditor.errors.titleTooLong';
  if (description.trim().length > ITEM_DESCRIPTION_MAX) errors.description = 'syllabusEditor.errors.descriptionTooLong';
  return errors;
}

/** Adds an item at the end of a level (the database gives it the next place). */
export async function addItem(levelId: number, title: string, description: string): Promise<EditOutcome> {
  const { data, error } = await supabase
    .from('syllabus_items')
    .insert({ level_id: levelId, title: title.trim(), description: description.trim() || null })
    .select('id')
    .single<{ id: number }>();
  return error ? { errorKey: editorErrorKey(error.message, error.code) } : { id: data.id };
}

/** Saves a changed title and description. Ticks stay as they are. */
export async function saveItem(id: number, title: string, description: string): Promise<EditOutcome> {
  return updated(
    await supabase
      .from('syllabus_items')
      .update({ title: title.trim(), description: description.trim() || null })
      .eq('id', id)
      .select('id'),
  );
}

/** Moves an item one place up or down among the items in use of its level. */
export async function moveItem(id: number, up: boolean): Promise<EditOutcome> {
  const { error } = await supabase.rpc('move_syllabus_item', { p_item: id, p_up: up });
  return error ? { errorKey: editorErrorKey(error.message, error.code) } : {};
}

/** Retires an item (no longer taught): its ticks stay, it cannot be ticked, it does not count. */
export async function retireItem(id: number): Promise<EditOutcome> {
  return updated(
    await supabase.from('syllabus_items').update({ retired_at: new Date().toISOString() }).eq('id', id).select('id'),
  );
}

/** Puts a retired item back in use, in its old place. */
export async function restoreItem(id: number): Promise<EditOutcome> {
  return updated(await supabase.from('syllabus_items').update({ retired_at: null }).eq('id', id).select('id'));
}

/** Deletes an item nobody has ticked and no material points to (a mistake). */
export async function deleteItem(id: number): Promise<EditOutcome> {
  const { data, error } = await supabase.from('syllabus_items').delete().eq('id', id).select('id');
  if (error) return { errorKey: editorErrorKey(error.message, error.code) };
  return data.length === 0 ? { errorKey: 'syllabusEditor.errors.notAllowed' } : {};
}

/** An update's answer: an empty answer means row-level security refused or the item is gone. */
function updated(result: { data: unknown[] | null; error: { message: string; code?: string } | null }): EditOutcome {
  if (result.error) return { errorKey: editorErrorKey(result.error.message, result.error.code) };
  return result.data && result.data.length > 0 ? {} : { errorKey: 'syllabusEditor.errors.notAllowed' };
}

/** Turns a database error into a translation key. */
function editorErrorKey(message: string, code: string | undefined): MessageKey {
  if (message === 'title_required') return 'syllabusEditor.errors.titleRequired';
  if (message === 'title_too_long') return 'syllabusEditor.errors.titleTooLong';
  if (message === 'description_too_long') return 'syllabusEditor.errors.descriptionTooLong';
  if (message === 'item_has_ticks') return 'syllabusEditor.errors.hasTicks';
  if (message === 'item_has_materials') return 'syllabusEditor.errors.hasMaterials';
  if (message === 'not_allowed' || code === '42501') return 'syllabusEditor.errors.notAllowed';
  return fallbackErrorKey(message);
}
