// Rhythm Playground content manager, facilitator side (docs/RHYTHM_PLAYGROUND.md §10; docs/DECISIONS.md #740-#749;
// migration 0065). Staff read every row of the four content tables (any status) and write drafts straight into
// them; 0065's triggers decide the rest (#720): an edit of an approved row goes back to review with revision + 1,
// only the head facilitator's login approves, retires and publishes (play_set_status, publish_playground, both in
// data/playground.ts), a draft never published can be deleted by its author or the head facilitator. Also the
// assignments (play_assignments) and the facilitator's 0-3 ratings (play_ratings).
//
// Placeholder rows (TEST only, §19.3) are made by the TEST seed, never here: every row this file writes has
// placeholder = false, so nothing the app saves can block a LIVE publish.

import * as Crypto from 'expo-crypto';

import { bodyOf, pickRecordingFiles, type PickedMedia } from '@/data/assessment-files';
import { parseAsset, parseBol, parseExercise, parseTemplate, playgroundErrorKey, PLAYGROUND_BUCKET } from '@/data/playground';
import type {
  AssetKind,
  ContentStatus,
  GameId,
  Head,
  PlayAsset,
  PlayBol,
  PlayExercise,
  PlayTemplate,
  ResponseMode,
  SkillId,
} from '@/lib/playground/types';
import { supabase } from '@/lib/supabase';

import { isNetworkError, type MessageKey } from './errors';

type Json = Record<string, unknown>;
const num = (v: unknown): number | null => (typeof v === 'number' ? v : typeof v === 'string' && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : null);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

// ---------------------------------------------------------------- reading

/** What every content row carries besides its content: where it is in the approval flow. */
export type ContentMeta = {
  status: ContentStatus;
  revision: number;
  placeholder: boolean;
  /** The version this revision was published in; null = not in the pack (new, edited, or retired). */
  publishedIn: number | null;
  /** The first version it was ever in; null = never published (a draft may then be deleted). */
  firstPublishedIn: number | null;
  createdBy: string | null;
  updatedAt: string;
};

export type AdminBol = PlayBol & ContentMeta & { transcription: string | null };
export type AdminAsset = PlayAsset & ContentMeta & { bytes: number | null; permissionRef: string | null };
export type AdminTemplate = PlayTemplate & ContentMeta;
export type AdminExercise = PlayExercise & ContentMeta;

/** One publish (play_publications). */
export type Publication = { version: number; publishedAt: string; note: string | null; counts: Json };

export type AdminContent = {
  bols: AdminBol[];
  assets: AdminAsset[];
  templates: AdminTemplate[];
  exercises: AdminExercise[];
  /** The latest publish; null = nothing published yet. */
  latest: Publication | null;
};

function meta(r: Json): ContentMeta {
  return {
    status: (str(r.status) as ContentStatus | null) ?? 'draft',
    revision: num(r.revision) ?? 1,
    placeholder: r.placeholder === true,
    publishedIn: num(r.published_in),
    firstPublishedIn: num(r.first_published_in),
    createdBy: str(r.created_by),
    updatedAt: String(r.updated_at ?? ''),
  };
}

/** Every content row, any status, and the latest publish. Null when it could not be read. */
export async function fetchContent(): Promise<AdminContent | null> {
  const [bols, assets, templates, exercises, latest] = await Promise.all([
    supabase.from('play_bols').select('*').order('id'),
    supabase.from('play_assets').select('*').order('id'),
    supabase.from('play_templates').select('*').order('id'),
    supabase.from('play_exercises').select('*').order('id'),
    supabase.from('play_publications').select('version, published_at, note, counts').order('version', { ascending: false }).limit(1),
  ]);
  if (bols.error || assets.error || templates.error || exercises.error || latest.error) return null;
  const pub = (latest.data as Json[] | null)?.[0];
  return {
    bols: (bols.data as Json[]).map((r) => ({ ...parseBol(r), ...meta(r), transcription: str(r.transcription) })),
    assets: (assets.data as Json[]).map((r) => ({ ...parseAsset(r), ...meta(r), bytes: num(r.bytes), permissionRef: str(r.permission_ref) })),
    templates: (templates.data as Json[]).map((r) => ({ ...parseTemplate(r), ...meta(r) })),
    exercises: (exercises.data as Json[]).map((r) => ({ ...parseExercise(r), ...meta(r) })),
    latest: pub
      ? { version: num(pub.version) ?? 0, publishedAt: String(pub.published_at ?? ''), note: str(pub.note), counts: (pub.counts as Json) ?? {} }
      : null,
  };
}

// ---------------------------------------------------------------- writing drafts

/** A content error from the database (the triggers' names) as a message. */
function saveErrorKey(message: string | undefined): MessageKey {
  if (!message) return 'common.genericError';
  if (/duplicate key|already exists/i.test(message)) return 'staffPlayground.errors.idTaken';
  if (/row-level security|permission denied/i.test(message)) return 'playEngine.errors.notAllowed';
  return playgroundErrorKey(message);
}

export type BolInput = {
  id: string;
  written: string;
  head: Head;
  technique: string;
  open: boolean | null;
  levelId: number;
  soundsLike: string[];
  closePairs: string[];
  assetId: number | null;
  transcription: string;
};

/** Adds (isNew) or changes a dictionary bol. An approved bol that is changed goes back to review. */
export async function saveBol(isNew: boolean, input: BolInput): Promise<MessageKey | null> {
  const row = {
    written: input.written,
    head: input.head,
    technique: input.technique,
    open: input.open,
    level_id: input.levelId,
    sounds_like: input.soundsLike,
    close_pairs: input.closePairs,
    asset_id: input.assetId,
    transcription: input.transcription,
  };
  const { error } = isNew
    ? await supabase.from('play_bols').insert({ id: input.id, ...row, placeholder: false })
    : await supabase.from('play_bols').update(row).eq('id', input.id);
  return error ? saveErrorKey(error.message) : null;
}

export type TemplateInput = {
  game: GameId;
  skill: SkillId;
  responseMode: ResponseMode;
  levelMin: number;
  levelMax: number;
  steps: unknown[];
  params: Json;
};

/** Adds (id null) or changes a template. */
export async function saveTemplate(id: number | null, input: TemplateInput): Promise<{ id: number } | { errorKey: MessageKey }> {
  const row = {
    game: input.game,
    skill: input.skill,
    response_mode: input.responseMode,
    level_min: input.levelMin,
    level_max: input.levelMax,
    steps: input.steps,
    params: input.params,
  };
  const query = id === null
    ? supabase.from('play_templates').insert({ ...row, placeholder: false }).select('id').single<{ id: number }>()
    : supabase.from('play_templates').update(row).eq('id', id).select('id').single<{ id: number }>();
  const { data, error } = await query;
  if (error || !data) return { errorKey: saveErrorKey(error?.message) };
  return { id: data.id };
}

export type ExerciseInput = {
  game: GameId;
  templateId: number | null;
  levelId: number;
  skills: SkillId[];
  taalId: number | null;
  sequence: string[] | null;
  divisions: number[] | null;
  answer: Json;
  distractors: string[];
  promptAssets: number[];
  bpmMin: number | null;
  bpmMax: number | null;
  guna: number[];
  attribution: string;
};

/** Adds (id null) or changes an exercise of the bank. */
export async function saveExercise(id: number | null, input: ExerciseInput): Promise<{ id: number } | { errorKey: MessageKey }> {
  const row = {
    game: input.game,
    template_id: input.templateId,
    level_id: input.levelId,
    skills: input.skills,
    taal_id: input.taalId,
    sequence: input.sequence,
    divisions: input.divisions,
    answer: input.answer,
    distractors: input.distractors,
    prompt_assets: input.promptAssets,
    bpm_min: input.bpmMin,
    bpm_max: input.bpmMax,
    guna: input.guna,
    attribution: input.attribution,
  };
  const query = id === null
    ? supabase.from('play_exercises').insert({ ...row, placeholder: false }).select('id').single<{ id: number }>()
    : supabase.from('play_exercises').update(row).eq('id', id).select('id').single<{ id: number }>();
  const { data, error } = await query;
  if (error || !data) return { errorKey: saveErrorKey(error?.message) };
  return { id: data.id };
}

/** The details of a sound a facilitator types (the file itself is chosen once, when the sound is added). */
export type SoundDetails = {
  licence: PlayAsset['licence'];
  performer: string;
  permissionRef: string;
  credit: string;
  bpm: number | null;
  instruments: string[];
};

function soundRow(d: SoundDetails) {
  return { licence: d.licence, performer: d.performer, permission_ref: d.permissionRef, credit: d.credit, bpm: d.bpm, instruments: d.instruments };
}

/** The sound files the bucket takes (0065: wav, m4a, mp3; 15 MB). */
export const SOUND_ENDINGS: Readonly<Record<string, PlayAsset['mime'] & string>> = { wav: 'audio/wav', m4a: 'audio/mp4', mp3: 'audio/mpeg' };
export const MAX_SOUND_BYTES = 15 * 1024 * 1024;

/** A chosen sound file, or why it cannot be used. */
export type PickedSound = { file: PickedMedia; ending: string; mime: string };

/** Opens the file chooser for one sound file (wav, m4a or mp3, at most 15 MB). */
export async function pickSoundFile(): Promise<PickedSound | { errorKey: MessageKey } | null> {
  const picked = await pickRecordingFiles(1);
  if (picked.errorKey && picked.files.length === 0) return { errorKey: picked.errorKey };
  const file = picked.files[0];
  if (!file) return null;
  const mime = SOUND_ENDINGS[file.ending];
  if (!mime) return { errorKey: 'staffPlayground.sound.wrongFile' };
  if (file.size > MAX_SOUND_BYTES) return { errorKey: 'staffPlayground.sound.tooBig' };
  return { file: { ...file, mimeType: mime }, ending: file.ending, mime };
}

/**
 * Adds a sound: the file uploaded into the bucket as <kind>/<random id>.<ending>, then its row (a draft). With no
 * file, `bundledKey` names a stroke the app carries (lib/khol-samples.ts). If the row is refused the file is removed.
 */
export async function addSound(
  kind: AssetKind,
  source: { picked: PickedSound } | { bundledKey: string },
  details: SoundDetails,
): Promise<{ id: number } | { errorKey: MessageKey }> {
  let path: string | null = null;
  if ('picked' in source) {
    path = `${kind}/${Crypto.randomUUID().toLowerCase()}.${source.picked.ending}`;
    try {
      const { error } = await supabase.storage
        .from(PLAYGROUND_BUCKET)
        .upload(path, await bodyOf(source.picked.file), { contentType: source.picked.mime, upsert: false });
      if (error) return { errorKey: isNetworkError(error.message) ? 'common.networkError' : 'staffPlayground.sound.uploadFailed' };
    } catch {
      return { errorKey: 'staffPlayground.sound.uploadFailed' };
    }
  }
  const row = {
    kind,
    path,
    bundled_key: 'bundledKey' in source ? source.bundledKey : null,
    mime: 'picked' in source ? source.picked.mime : null,
    bytes: 'picked' in source ? source.picked.file.size : null,
    ...soundRow(details),
    placeholder: false,
  };
  const { data, error } = await supabase.from('play_assets').insert(row).select('id').single<{ id: number }>();
  if (error || !data) {
    if (path) await supabase.storage.from(PLAYGROUND_BUCKET).remove([path]);
    return { errorKey: saveErrorKey(error?.message) };
  }
  return { id: data.id };
}

/** Changes a sound's details (an approved sound goes back to review). */
export async function saveSoundDetails(id: number, details: SoundDetails): Promise<MessageKey | null> {
  const { error } = await supabase.from('play_assets').update(soundRow(details)).eq('id', id);
  return error ? saveErrorKey(error.message) : null;
}

export type ContentTable = 'play_bols' | 'play_assets' | 'play_templates' | 'play_exercises';

/**
 * Deletes a draft that was never published (its author or the head facilitator; the database refuses the rest).
 * A sound's file goes with its row.
 */
export async function deleteDraft(table: ContentTable, id: string | number, filePath?: string | null): Promise<MessageKey | null> {
  const { data, error } = await supabase.from(table).delete().eq('id', id).select('id');
  if (error) return saveErrorKey(error.message);
  if (!data || data.length === 0) return 'staffPlayground.errors.notDeleted';
  if (filePath) await supabase.storage.from(PLAYGROUND_BUCKET).remove([filePath]);
  return null;
}

// ---------------------------------------------------------------- assignments

export type AdminAssignment = {
  id: number;
  game: GameId;
  skill: SkillId | null;
  levelId: number | null;
  groupId: number | null;
  groupName: string | null;
  studentId: string | null;
  studentName: string | null;
  stepMin: number | null;
  stepMax: number | null;
  fromDay: string;
  dueDay: string | null;
  note: string | null;
};

/** Every assignment still running or to come (due today or later, or no due day), newest first. */
export async function fetchAssignments(today: string): Promise<AdminAssignment[] | null> {
  const { data, error } = await supabase
    .from('play_assignments')
    .select('id, game, skill, level_id, group_id, student_id, step_min, step_max, from_day, due_day, note, groups(name), students(full_name)')
    .or(`due_day.is.null,due_day.gte.${today}`)
    .order('id', { ascending: false });
  if (error || !data) return null;
  return (data as Json[]).map((r) => {
    const group = (Array.isArray(r.groups) ? r.groups[0] : r.groups) as Json | null;
    const student = (Array.isArray(r.students) ? r.students[0] : r.students) as Json | null;
    return {
      id: num(r.id) ?? 0,
      game: r.game as GameId,
      skill: (str(r.skill) as SkillId | null) ?? null,
      levelId: num(r.level_id),
      groupId: num(r.group_id),
      groupName: str(group?.name),
      studentId: str(r.student_id),
      studentName: str(student?.full_name),
      stepMin: num(r.step_min),
      stepMax: num(r.step_max),
      fromDay: String(r.from_day ?? ''),
      dueDay: str(r.due_day),
      note: str(r.note),
    };
  });
}

export type AssignmentInput = {
  game: GameId;
  skill: SkillId | null;
  target: { levelId: number } | { groupId: number } | { studentId: string };
  stepMin: number | null;
  stepMax: number | null;
  dueDay: string | null;
  note: string;
};

/** Adds an assignment (from today). */
export async function addAssignment(input: AssignmentInput): Promise<MessageKey | null> {
  const { error } = await supabase.from('play_assignments').insert({
    game: input.game,
    skill: input.skill,
    level_id: 'levelId' in input.target ? input.target.levelId : null,
    group_id: 'groupId' in input.target ? input.target.groupId : null,
    student_id: 'studentId' in input.target ? input.target.studentId : null,
    step_min: input.stepMin,
    step_max: input.stepMax,
    due_day: input.dueDay,
    note: input.note,
  });
  return error ? saveErrorKey(error.message) : null;
}

/** Ends an assignment (the row goes; rounds already played keep their mode). */
export async function removeAssignment(id: number): Promise<MessageKey | null> {
  const { error } = await supabase.from('play_assignments').delete().eq('id', id);
  return error ? saveErrorKey(error.message) : null;
}

// ---------------------------------------------------------------- ratings

/** Saves a facilitator's 0-3 rating of one of a student's skills (never their own record: the database refuses). */
export async function rateSkill(studentId: string, skill: SkillId, rating: number, note: string): Promise<MessageKey | null> {
  const { error } = await supabase.from('play_ratings').insert({ student_id: studentId, skill, rating, note });
  if (!error) return null;
  if (/own_record/.test(error.message)) return 'staffPlayground.student.ownRecord';
  return saveErrorKey(error.message);
}
