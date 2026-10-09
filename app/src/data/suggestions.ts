// C18 Suggest material (Phase 2 slice 8, docs/DECISIONS.md #65): a coordinator suggests a lesson
// material with the G5 form (staff/materials/[id].tsx, `id` = 'new'), and a short reason. It is a
// material with approved_by empty: students do not see it until the Guru adds it to the lessons
// or declines it with a reason (decide_material_suggestion, migration 0023). Both sides get a
// notice. The coordinator may take back a waiting suggestion and remove a declined one.

import type { ParseKeys } from 'i18next';

import { supabase } from '@/lib/supabase';

import { removeFiles } from './announcement-files';
import { fallbackErrorKey } from './errors';
import { MATERIALS_BUCKET, type Material } from './materials';

/** Longest reason for a suggestion, as in the database. */
export const SUGGEST_REASON_MAX = 500;

/** Where a suggestion stands. */
export type SuggestionState = 'waiting' | 'added' | 'declined';

/** One suggestion, with the material it is. */
export type Suggestion = {
  material: Material;
  state: SuggestionState;
  reason: string | null;
  declinedReason: string | null;
  suggestedBy: string;
  suggestedById: string | null;
  createdAt: string;
  decidedAt: string | null;
};

type Row = {
  id: number;
  title: string;
  kind: Material['kind'] | 'audio';
  url: string | null;
  storage_path: string | null;
  file_name: string | null;
  file_size: number | null;
  body: string | null;
  level_id: number | null;
  item_id: number | null;
  approved_by: string | null;
  panes: number | null;
  uploaded_by: string | null;
  created_at: string;
  suggest_reason: string | null;
  decided_at: string | null;
  declined_reason: string | null;
  uploader: { full_name: string } | null;
};

const COLUMNS =
  'id, title, kind, url, storage_path, file_name, file_size, body, level_id, item_id, approved_by, panes, uploaded_by, created_at, ' +
  'suggest_reason, decided_at, declined_reason, uploader:profiles!materials_uploaded_by_fkey(full_name)';

function toSuggestion(row: Row): Suggestion | null {
  if (row.kind === 'audio') return null;
  return {
    material: {
      id: row.id,
      title: row.title,
      kind: row.kind,
      url: row.url,
      storagePath: row.storage_path,
      fileName: row.file_name,
      fileSize: row.file_size,
      body: row.body,
      levelId: row.level_id,
      itemId: row.item_id,
      approved: row.approved_by !== null,
      panes: row.panes ?? 1,
    },
    state: row.approved_by !== null ? 'added' : row.decided_at ? 'declined' : 'waiting',
    reason: row.suggest_reason,
    declinedReason: row.declined_reason,
    suggestedBy: row.uploader?.full_name ?? '',
    suggestedById: row.uploaded_by,
    createdAt: row.created_at,
    decidedAt: row.decided_at,
  };
}

/**
 * The suggestions to show. The Guru: every waiting one, and those decided in the last 30 days.
 * A coordinator: their own, waiting first, then decided ones of the last 90 days. Oldest waiting
 * first; decided newest first. null = could not be loaded.
 */
export async function fetchSuggestions(myId: string, isGuru: boolean): Promise<Suggestion[] | null> {
  const since = new Date(Date.now() - (isGuru ? 30 : 90) * 24 * 3600 * 1000).toISOString();
  // Waiting, or decided lately. The Guru's own materials are approved without a decision, so they
  // are not in it.
  let query = supabase
    .from('materials')
    .select(COLUMNS)
    .or(`and(approved_by.is.null,decided_at.is.null),decided_at.gte.${since}`);
  if (!isGuru) query = query.eq('uploaded_by', myId);
  const { data, error } = await query;
  if (error) return null;
  const all = (data as unknown as Row[]).flatMap((row) => toSuggestion(row) ?? []);
  const waiting = all.filter((s) => s.state === 'waiting').sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const decided = all
    .filter((s) => s.state !== 'waiting')
    .sort((a, b) => (b.decidedAt ?? '').localeCompare(a.decidedAt ?? ''));
  return [...waiting, ...decided];
}

/** One suggestion (for the Guru's review on the material form). 'not_found' when it is gone. */
export async function fetchSuggestion(id: number): Promise<Suggestion | 'not_found' | null> {
  const { data, error } = await supabase.from('materials').select(COLUMNS).eq('id', id).maybeSingle();
  if (error) return null;
  return data ? (toSuggestion(data as unknown as Row) ?? 'not_found') : 'not_found';
}

/** How many suggestions wait for the Guru (for the link on the home screen). null = unknown. */
export async function countWaitingSuggestions(): Promise<number | null> {
  const { count, error } = await supabase
    .from('materials')
    .select('id', { count: 'exact', head: true })
    .is('approved_by', null)
    .is('decided_at', null);
  return error ? null : (count ?? 0);
}

/** The Guru adds a waiting suggestion to the lessons, or declines it with a reason. */
export async function decideSuggestion(id: number, approve: boolean, reason: string): Promise<{ errorKey?: ParseKeys }> {
  if (!approve && !reason.trim()) return { errorKey: 'suggestions.errors.reason_required' };
  if (reason.trim().length > SUGGEST_REASON_MAX) return { errorKey: 'suggestions.errors.reason_too_long' };
  const { error } = await supabase.rpc('decide_material_suggestion', {
    p_material: id,
    p_approve: approve,
    p_reason: approve ? null : reason.trim(),
  });
  return error ? { errorKey: suggestionErrorKey(error.message, error.code) } : {};
}

/**
 * The coordinator takes back a waiting suggestion or removes a declined one, with its file. The
 * file goes first: if that fails nothing is deleted.
 */
export async function removeSuggestion(material: Material): Promise<{ errorKey?: ParseKeys }> {
  if (material.storagePath && !(await removeFiles([material.storagePath], MATERIALS_BUCKET))) {
    return { errorKey: 'materials.errors.removeFailed' };
  }
  const { data, error } = await supabase.from('materials').delete().eq('id', material.id).select('id');
  if (error) return { errorKey: suggestionErrorKey(error.message, error.code) };
  return data.length === 0 ? { errorKey: 'suggestions.errors.already_decided' } : {};
}

const KNOWN = ['reason_required', 'reason_too_long', 'already_decided', 'too_many_suggestions', 'material_not_found', 'suggestion_frozen'] as const;

/** Turns a database error into a translation key. */
export function suggestionErrorKey(message: string, code: string | undefined): ParseKeys {
  const known = KNOWN.find((k) => k === message);
  if (known) return `suggestions.errors.${known}`;
  if (code === '42501' || message === 'not_allowed') return 'suggestions.errors.not_allowed';
  return fallbackErrorKey(message);
}
