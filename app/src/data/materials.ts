// The materials library (G5 for the Guru; S4 My progress for students): lessons and other
// materials for a level, and optionally for one syllabus item. A material is a YouTube link
// (lesson videos are unlisted YouTube videos), a PDF or a photo; notes come only from the
// dummy data. PDFs and photos are kept in the private Storage bucket material-files, at most
// 10 MB each, picked and uploaded the same way as announcement files
// (src/data/announcement-files.ts). The database checks everything again: the link, the file,
// who may add, open and delete (migration 0013_syllabus_materials.sql, docs/DECISIONS.md #44).
//
// Students read the approved materials up to their own level (row-level security, policy
// `visible` in 0001). Only the Guru adds, edits and removes materials; coordinators
// suggest them (C18, data/suggestions.ts, migration 0023), and the lists here show approved ones.

import * as WebBrowser from 'expo-web-browser';
import { Linking } from 'react-native';

import type { LessonSource } from '@/lib/lesson-player-html';
import { supabase } from '@/lib/supabase';

import {
  pickPdfs,
  pickPhotos,
  removeFiles,
  signedLinks,
  uploadFiles,
  type PickedFile,
  type PickLimit,
  type PickResult,
} from './announcement-files';
import { fallbackErrorKey, type MessageKey } from './errors';

/** The private Storage bucket (migration 0013). */
export const MATERIALS_BUCKET = 'material-files';
/** Largest file Storage accepts for a material, in bytes: 10 MB. */
export const MAX_MATERIAL_BYTES = 10 * 1024 * 1024;
/** Longest title, as in the database. */
export const MATERIAL_TITLE_MAX = 120;
/** Longest note under a material, as in the database. */
export const MATERIAL_NOTE_MAX = 1000;

const LIMIT: PickLimit = { maxBytes: MAX_MATERIAL_BYTES, tooBigKey: 'materials.errors.tooBig' };

/** What a material is. The form offers youtube, pdf and image. */
export type MaterialKind = 'youtube' | 'video' | 'pdf' | 'image' | 'note';

/** One material. */
export type Material = {
  id: number;
  title: string;
  kind: MaterialKind;
  /** The YouTube link (kind youtube) or the link to the team's own video file (kind video). */
  url: string | null;
  /** Where the PDF or photo is in the bucket. */
  storagePath: string | null;
  fileName: string | null;
  fileSize: number | null;
  /** Optional note under the title; the text of a note. */
  body: string | null;
  /** null = every level. */
  levelId: number | null;
  /** null = the whole level, not one item. */
  itemId: number | null;
  /** false = a coordinator's suggestion waiting for the Guru (Phase 2). */
  approved: boolean;
  /** A video file: camera angles side by side (1-4, V2); 1 for every other kind (migration 0020). */
  panes: number;
};

type MaterialRow = {
  id: number;
  title: string;
  kind: MaterialKind | 'audio';
  url: string | null;
  storage_path: string | null;
  file_name: string | null;
  file_size: number | null;
  body: string | null;
  level_id: number | null;
  item_id: number | null;
  approved_by: string | null;
  panes: number | null;
};

const COLUMNS = 'id, title, kind, url, storage_path, file_name, file_size, body, level_id, item_id, approved_by, panes';

function toMaterial(row: MaterialRow): Material | null {
  // Audio is not offered yet; a row added in the dashboard is skipped rather than shown broken.
  if (row.kind === 'audio') return null;
  return {
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
  };
}

/**
 * The materials of one level and those for every level, oldest first (the order the Guru added
 * them). Row-level security decides what a student sees. null = could not be loaded.
 */
export async function fetchMaterials(levelId: number): Promise<Material[] | null> {
  const { data, error } = await supabase
    .from('materials')
    .select(COLUMNS)
    .or(`level_id.eq.${levelId},level_id.is.null`)
    // Coordinators' suggestions (C18) wait on their own screen until the Guru adds them.
    .not('approved_by', 'is', null)
    .order('created_at')
    .order('id');
  if (error) return null;
  return (data as MaterialRow[]).flatMap((row) => toMaterial(row) ?? []);
}

/** One material, for the edit form. 'not_found' when it is gone, null when it could not be loaded. */
export async function fetchMaterial(id: number): Promise<Material | 'not_found' | null> {
  const { data, error } = await supabase.from('materials').select(COLUMNS).eq('id', id).maybeSingle<MaterialRow>();
  if (error) return null;
  return data ? (toMaterial(data) ?? 'not_found') : 'not_found';
}

/** How many materials each level has, and how many for every level (key null). */
export async function countMaterialsByLevel(): Promise<Map<number | null, number> | null> {
  const { data, error } = await supabase.from('materials').select('level_id').not('approved_by', 'is', null);
  if (error) return null;
  const counts = new Map<number | null, number>();
  for (const row of data as { level_id: number | null }[]) counts.set(row.level_id, (counts.get(row.level_id) ?? 0) + 1);
  return counts;
}

// ---------------------------------------------------------------- YouTube links

/** The 11-character video id of a YouTube video link, or null when it is not one. */
export function youtubeVideoId(link: string): string | null {
  const match =
    /^https:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|live\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})(?:[?&#/].*)?$/.exec(
      link.trim(),
    );
  return match ? match[1] : null;
}

/** Most camera angles side by side in one lesson video (V2), as in the database. */
export const MAX_PANES = 4;

/**
 * True for a link to a video file the team keeps (https, .mp4 / .webm / .m4v / .mov, at most 500
 * characters), as video_link_ok in migration 0020. Mirror and zoom work only on such files.
 */
export function videoLinkOk(link: string): boolean {
  const value = link.trim();
  return value.length <= 500 && /^https:\/\/[^\s/?#]+\/[^\s?#]*\.(mp4|webm|m4v|mov)([?#]\S*)?$/i.test(value);
}

/** What the V3 player plays for a material; null when it is not a lesson video. */
export function lessonSourceOf(material: Material): LessonSource | null {
  if (material.kind === 'youtube' && material.url) {
    const videoId = youtubeVideoId(material.url);
    return videoId ? { kind: 'youtube', videoId } : null;
  }
  if (material.kind === 'video' && material.url) return { kind: 'file', url: material.url, panes: material.panes };
  return null;
}

// ---------------------------------------------------------------- the form

/** What the material form holds. */
export type MaterialForm = {
  title: string;
  /** youtube, video, pdf or image for a new material; a note (dummy data) can only be edited. */
  kind: MaterialKind;
  link: string;
  /** A video file: camera angles side by side, 1-4. */
  panes: number;
  note: string;
  levelId: number | null;
  itemId: number | null;
  /** A picked PDF or photo (new materials only). */
  file: PickedFile | null;
  /** C18: a coordinator's reason for suggesting it, for the Guru (Phase 2 slice 8). */
  reason?: string;
};

/** Problems with the form, as translation keys per field. Empty = fine. */
export type MaterialFormErrors = Partial<Record<'title' | 'link' | 'file' | 'note', MessageKey>>;

/** Checks the form before saving; the database checks the same. `isNew` = adding, not editing. */
export function checkMaterialForm(form: MaterialForm, isNew: boolean): MaterialFormErrors {
  const errors: MaterialFormErrors = {};
  const title = form.title.trim();
  if (!title) errors.title = 'materials.errors.titleRequired';
  else if (title.length > MATERIAL_TITLE_MAX) errors.title = 'materials.errors.titleTooLong';
  if (form.kind === 'youtube' && !youtubeVideoId(form.link)) errors.link = 'materials.errors.linkInvalid';
  if (form.kind === 'video' && !videoLinkOk(form.link)) errors.link = 'materials.errors.videoLinkInvalid';
  if (isNew && (form.kind === 'pdf' || form.kind === 'image') && !form.file) errors.file = 'materials.errors.fileRequired';
  if (form.note.trim().length > MATERIAL_NOTE_MAX) errors.note = 'materials.errors.noteTooLong';
  return errors;
}

/** Opens the photo library or file chooser for one photo or PDF of at most 10 MB. */
export async function pickMaterialFile(kind: 'pdf' | 'image'): Promise<PickResult> {
  return kind === 'pdf' ? pickPdfs(1, LIMIT) : pickPhotos(1, LIMIT);
}

/** The outcome of saving: the material's id, or a message (nothing was saved). */
export type SaveOutcome = { id?: number; errorKey?: MessageKey };

/**
 * Adds a material: uploads its file first (into the Guru's own folder), then saves the row. If
 * the row cannot be saved, the uploaded file is removed again.
 */
export async function addMaterial(myId: string, form: MaterialForm): Promise<SaveOutcome> {
  let file: { path: string; name: string; size: number } | null = null;
  if (form.kind === 'pdf' || form.kind === 'image') {
    if (!form.file) return { errorKey: 'materials.errors.fileRequired' };
    const uploaded = await uploadFiles(myId, [form.file], MATERIALS_BUCKET);
    if (!uploaded.attachments) return { errorKey: uploaded.errorKey ?? 'materials.errors.uploadFailed' };
    file = uploaded.attachments[0];
  }
  const { data, error } = await supabase
    .from('materials')
    .insert({
      title: form.title.trim(),
      kind: form.kind,
      url: form.kind === 'youtube' || form.kind === 'video' ? form.link.trim() : null,
      panes: form.kind === 'video' ? form.panes : 1,
      storage_path: file?.path ?? null,
      file_name: file?.name ?? null,
      file_size: file?.size ?? null,
      body: form.note.trim() || null,
      level_id: form.levelId,
      item_id: form.itemId,
      suggest_reason: form.reason?.trim() || null,
    })
    .select('id')
    .single<{ id: number }>();
  if (error) {
    if (file) await removeFiles([file.path], MATERIALS_BUCKET);
    return { errorKey: materialErrorKey(error.message, error.code) };
  }
  return { id: data.id };
}

/** Saves a changed title, link, note, level or item. The file and kind stay as they are. */
export async function updateMaterial(id: number, form: MaterialForm): Promise<SaveOutcome> {
  const { data, error } = await supabase
    .from('materials')
    .update({
      title: form.title.trim(),
      ...(form.kind === 'youtube' || form.kind === 'video' ? { url: form.link.trim() } : {}),
      ...(form.kind === 'video' ? { panes: form.panes } : {}),
      body: form.note.trim() || null,
      level_id: form.levelId,
      item_id: form.itemId,
    })
    .eq('id', id)
    .select('id');
  if (error) return { errorKey: materialErrorKey(error.message, error.code) };
  return data.length === 0 ? { errorKey: 'materials.errors.gone' } : { id };
}

/**
 * Removes a material and its file. The file goes first: if that fails nothing is deleted, so no
 * file is left in Storage without its material.
 */
export async function deleteMaterial(material: Material): Promise<{ errorKey?: MessageKey }> {
  if (material.storagePath && !(await removeFiles([material.storagePath], MATERIALS_BUCKET))) {
    return { errorKey: 'materials.errors.removeFailed' };
  }
  const { error } = await supabase.from('materials').delete().eq('id', material.id);
  return error ? { errorKey: materialErrorKey(error.message, error.code) } : {};
}

// ---------------------------------------------------------------- opening

/**
 * Opens a material: a YouTube link in the YouTube app when the phone has it (else the browser),
 * a PDF or photo in the browser through a signed link that works for an hour. Returns false when
 * it could not be opened (usually no internet).
 */
export async function openMaterial(material: Material): Promise<boolean> {
  try {
    if ((material.kind === 'youtube' || material.kind === 'video') && material.url) {
      await Linking.openURL(material.url);
      return true;
    }
    if (material.storagePath) {
      const link = (await signedLinks([material.storagePath], MATERIALS_BUCKET)).get(material.storagePath);
      if (!link) return false;
      await WebBrowser.openBrowserAsync(link);
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

/** Signed links for the photos among `materials`, to show them small (by storage path). */
export async function photoLinks(materials: readonly Material[]): Promise<Map<string, string>> {
  const paths = materials.flatMap((m) => (m.kind === 'image' && m.storagePath ? [m.storagePath] : []));
  return signedLinks(paths, MATERIALS_BUCKET);
}

/** Turns a database error from the calls above into a translation key. */
function materialErrorKey(message: string, code: string | undefined): MessageKey {
  if (message === 'title_required') return 'materials.errors.titleRequired';
  if (message === 'title_too_long') return 'materials.errors.titleTooLong';
  if (message === 'note_too_long') return 'materials.errors.noteTooLong';
  if (message === 'youtube_link_invalid') return 'materials.errors.linkInvalid';
  if (message === 'video_link_invalid') return 'materials.errors.videoLinkInvalid';
  if (message === 'panes_invalid') return 'materials.errors.panesInvalid';
  if (message.startsWith('material_file_')) return 'materials.errors.uploadFailed';
  if (message === 'reason_too_long') return 'suggestions.errors.reason_too_long';
  if (message === 'too_many_suggestions') return 'suggestions.errors.too_many_suggestions';
  if (code === '42501') return 'materials.errors.notAllowed';
  if (code === '23503') return 'materials.errors.gone';
  return fallbackErrorKey(message);
}
