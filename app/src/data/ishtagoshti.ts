// Ishtagoshti part 1, sloka study (Phase 2 slice 6, docs/DECISIONS.md #57): the slokas and themes
// everyone signed in reads (I1 home, I2 themes, I3 sloka), the sloka of the day, private notes and
// "I have memorised it" ticks, and the editors' screens (I11 theme, I12 sloka) for the Guru and the
// coordinators the Guru marks as Ishtagoshti editors. Database: supabase/migrations/0021_ishtagoshti.sql.
// Row-level security: readers see published slokas and themes only, editors all; notes are the
// writer's alone; a tick is the person's own (staff may read them). The translation and purport are
// the temple's own (never BBT text): a sloka is published only with that confirmed (own_text).

import * as Crypto from 'expo-crypto';

import { todayLocal } from '@/lib/dates';
import { supabase } from '@/lib/supabase';

import { bodyOf, endingFor, pickRecordingFiles, recordingAsMedia, type PickedMedia } from './assessment-files';
import { isNetworkError, type MessageKey } from './errors';

/** The languages a translation and purport may be written in, in the order they are offered. */
export const IG_LANGUAGES = ['en', 'te', 'hi'] as const;
export type IgLanguage = (typeof IG_LANGUAGES)[number];
/** Text per language; a missing language is not written yet. */
export type ByLanguage = Partial<Record<IgLanguage, string>>;

/** One sloka (table ig_slokas). */
export type Sloka = {
  id: number;
  ref: string;
  devanagari: string;
  transliteration: string;
  wordMeanings: string | null;
  translation: ByLanguage;
  purport: ByLanguage;
  translator: string | null;
  ownText: boolean;
  audioPath: string | null;
  audioName: string | null;
  sample: boolean;
  published: boolean;
  sort: number;
};

type SlokaRow = {
  id: number;
  ref: string;
  devanagari: string;
  transliteration: string;
  word_meanings: string | null;
  translation_en: string | null;
  translation_te: string | null;
  translation_hi: string | null;
  purport_en: string | null;
  purport_te: string | null;
  purport_hi: string | null;
  translator: string | null;
  own_text: boolean;
  audio_path: string | null;
  audio_name: string | null;
  sample: boolean;
  published: boolean;
  sort: number;
};

const SLOKA_COLUMNS =
  'id, ref, devanagari, transliteration, word_meanings, translation_en, translation_te, translation_hi, purport_en, purport_te, purport_hi, translator, own_text, audio_path, audio_name, sample, published, sort';

function byLanguage(en: string | null, te: string | null, hi: string | null): ByLanguage {
  const out: ByLanguage = {};
  if (en) out.en = en;
  if (te) out.te = te;
  if (hi) out.hi = hi;
  return out;
}

function slokaOf(row: SlokaRow): Sloka {
  return {
    id: row.id,
    ref: row.ref,
    devanagari: row.devanagari,
    transliteration: row.transliteration,
    wordMeanings: row.word_meanings,
    translation: byLanguage(row.translation_en, row.translation_te, row.translation_hi),
    purport: byLanguage(row.purport_en, row.purport_te, row.purport_hi),
    translator: row.translator,
    ownText: row.own_text,
    audioPath: row.audio_path,
    audioName: row.audio_name,
    sample: row.sample,
    published: row.published,
    sort: row.sort,
  };
}

/**
 * The text to show in the reader's language, or else in English, Telugu or Hindi (whichever is
 * written first). `language` says which one it is, so the screen can say "shown in English".
 */
export function inLanguage(texts: ByLanguage, wanted: string): { text: string; language: IgLanguage } | null {
  const order = [wanted, ...IG_LANGUAGES.filter((l) => l !== wanted)] as IgLanguage[];
  for (const language of order) {
    const text = texts[language];
    if (text) return { text, language };
  }
  return null;
}

/** The first line of the transliteration, for lists. */
export function firstLine(sloka: Pick<Sloka, 'transliteration'>): string {
  return sloka.transliteration.split('\n')[0].trim();
}

/** One theme (table ig_themes) with its slokas' ids in order. */
export type Theme = {
  id: number;
  title: string;
  intro: string | null;
  questions: string | null;
  sample: boolean;
  published: boolean;
  sort: number;
  slokaIds: number[];
};

type ThemeRow = {
  id: number;
  title: string;
  intro: string | null;
  questions: string | null;
  sample: boolean;
  published: boolean;
  sort: number;
};

const THEME_COLUMNS = 'id, title, intro, questions, sample, published, sort';

/** Whether the signed-in person may edit slokas and themes (the Guru, or a coordinator marked editor). */
export async function fetchCanEdit(): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_ig_editor');
  return !error && data === true;
}

/** Every sloka the person can see (editors: drafts too), in order. Null = could not load. */
export async function fetchSlokas(): Promise<Sloka[] | null> {
  const { data, error } = await supabase.from('ig_slokas').select(SLOKA_COLUMNS).order('sort').order('id');
  return error ? null : (data as SlokaRow[]).map(slokaOf);
}

/** Every theme the person can see, in order, with its slokas. Null = could not load. */
export async function fetchThemes(): Promise<Theme[] | null> {
  const [themes, links] = await Promise.all([
    supabase.from('ig_themes').select(THEME_COLUMNS).order('sort').order('id'),
    supabase.from('ig_theme_slokas').select('theme_id, sloka_id, position').order('position'),
  ]);
  if (themes.error || links.error) return null;
  const byTheme = new Map<number, number[]>();
  for (const link of links.data as { theme_id: number; sloka_id: number }[]) {
    byTheme.set(link.theme_id, [...(byTheme.get(link.theme_id) ?? []), link.sloka_id]);
  }
  return (themes.data as ThemeRow[]).map((row) => ({
    id: row.id,
    title: row.title,
    intro: row.intro,
    questions: row.questions,
    sample: row.sample,
    published: row.published,
    sort: row.sort,
    slokaIds: byTheme.get(row.id) ?? [],
  }));
}

/** What I1 shows. */
export type IshtagoshtiHome = {
  /** The sloka of the day; null when no sloka is published yet. */
  today: Sloka | null;
  themes: Theme[];
  slokas: Sloka[];
  /** The slokas the person has ticked as memorised. */
  memorised: Set<number>;
  canEdit: boolean;
};

/** Loads I1. Null = could not load (usually no internet). */
export async function fetchIshtagoshtiHome(profileId: string): Promise<IshtagoshtiHome | null> {
  const [today, themes, slokas, memorised, canEdit] = await Promise.all([
    supabase.rpc('ig_sloka_of_day'),
    fetchThemes(),
    fetchSlokas(),
    supabase.from('ig_memorised').select('sloka_id').eq('profile_id', profileId),
    fetchCanEdit(),
  ]);
  if (today.error || !themes || !slokas || memorised.error) return null;
  const todayId = typeof today.data === 'number' ? today.data : null;
  return {
    today: slokas.find((s) => s.id === todayId) ?? null,
    themes,
    slokas,
    memorised: new Set((memorised.data as { sloka_id: number }[]).map((m) => m.sloka_id)),
    canEdit,
  };
}

/** A day a sloka is pinned as the sloka of the day ('YYYY-MM-DD', at the class). */
export type Pin = { day: string; slokaId: number };

/** What I3 shows about one sloka. */
export type SlokaPage = {
  sloka: Sloka;
  /** The themes it is in (that the person can see). */
  themes: { id: number; title: string }[];
  /** The person's own note, '' when none. */
  note: string;
  memorised: boolean;
  /** Days from today on which it is pinned (editors only; empty for readers). */
  pins: string[];
  canEdit: boolean;
};

/** Loads I3. Null = could not load; 'not_found' = no such sloka, or not published. */
export async function fetchSlokaPage(id: number, profileId: string): Promise<SlokaPage | 'not_found' | null> {
  const [sloka, links, note, memorised, canEdit] = await Promise.all([
    supabase.from('ig_slokas').select(SLOKA_COLUMNS).eq('id', id).maybeSingle<SlokaRow>(),
    supabase.from('ig_theme_slokas').select('theme_id, ig_themes(id, title)').eq('sloka_id', id),
    supabase.from('ig_notes').select('body').eq('sloka_id', id).eq('profile_id', profileId).maybeSingle<{ body: string }>(),
    supabase.from('ig_memorised').select('sloka_id').eq('sloka_id', id).eq('profile_id', profileId).maybeSingle(),
    fetchCanEdit(),
  ]);
  if (sloka.error || links.error || note.error || memorised.error) return null;
  if (!sloka.data) return 'not_found';
  let pins: string[] = [];
  if (canEdit) {
    const { data, error } = await supabase
      .from('ig_daily_pins')
      .select('day')
      .eq('sloka_id', id)
      .gte('day', todayLocal())
      .order('day');
    if (error) return null;
    pins = (data as { day: string }[]).map((p) => p.day);
  }
  const themes = (links.data as unknown as { ig_themes: { id: number; title: string } | null }[])
    .flatMap((l) => (l.ig_themes ? [l.ig_themes] : []))
    .sort((a, b) => a.title.localeCompare(b.title));
  return { sloka: slokaOf(sloka.data), themes, note: note.data?.body ?? '', memorised: !!memorised.data, pins, canEdit };
}

// ---------------------------------------------------------------- the reader's own

/** Saves the person's private note on a sloka; an empty note deletes it. */
export async function saveNote(profileId: string, slokaId: number, body: string): Promise<MessageKey | null> {
  const text = body.trim();
  if (text.length > 2000) return 'ishtagoshti.errors.note_too_long';
  const { error } = text
    ? await supabase
        .from('ig_notes')
        .upsert({ profile_id: profileId, sloka_id: slokaId, body: text, updated_at: new Date().toISOString() })
    : await supabase.from('ig_notes').delete().eq('profile_id', profileId).eq('sloka_id', slokaId);
  return error ? errorKeyOf(error.message) : null;
}

/** Sets or takes away the person's "I have memorised it" tick. */
export async function setMemorised(profileId: string, slokaId: number, on: boolean): Promise<MessageKey | null> {
  const { error } = on
    ? await supabase.from('ig_memorised').insert({ profile_id: profileId, sloka_id: slokaId })
    : await supabase.from('ig_memorised').delete().eq('profile_id', profileId).eq('sloka_id', slokaId);
  // Ticked twice (two quick taps, another device): it is ticked, which is what was wanted.
  if (error && /duplicate key/i.test(error.message)) return null;
  return error ? errorKeyOf(error.message) : null;
}

// ---------------------------------------------------------------- editing (I11, I12)

/** What an editor types for a sloka. */
export type SlokaInput = {
  ref: string;
  devanagari: string;
  transliteration: string;
  wordMeanings: string;
  translation: Record<IgLanguage, string>;
  purport: Record<IgLanguage, string>;
  translator: string;
  ownText: boolean;
  published: boolean;
  sample: boolean;
  sort: number;
  audio: { path: string; name: string } | null;
};

/** Saves a sloka (new when `id` is null). Returns its id or the message to show. */
export async function saveSloka(id: number | null, input: SlokaInput): Promise<{ id: number } | { errorKey: MessageKey }> {
  const row = {
    ref: input.ref,
    devanagari: input.devanagari,
    transliteration: input.transliteration,
    word_meanings: input.wordMeanings,
    translation_en: input.translation.en,
    translation_te: input.translation.te,
    translation_hi: input.translation.hi,
    purport_en: input.purport.en,
    purport_te: input.purport.te,
    purport_hi: input.purport.hi,
    translator: input.translator,
    own_text: input.ownText,
    published: input.published,
    sample: input.sample,
    sort: input.sort,
    audio_path: input.audio?.path ?? null,
    audio_name: input.audio?.name ?? null,
  };
  const query = id === null
    ? supabase.from('ig_slokas').insert(row).select('id').single<{ id: number }>()
    : supabase.from('ig_slokas').update(row).eq('id', id).select('id').single<{ id: number }>();
  const { data, error } = await query;
  if (error || !data) return { errorKey: errorKeyOf(error?.message) };
  return { id: data.id };
}

/** Deletes a sloka; its theme places, pins, notes and ticks go with it. */
export async function deleteSloka(id: number): Promise<MessageKey | null> {
  const { error } = await supabase.from('ig_slokas').delete().eq('id', id);
  return error ? errorKeyOf(error.message) : null;
}

/** What an editor types for a theme. */
export type ThemeInput = {
  title: string;
  intro: string;
  questions: string;
  published: boolean;
  sample: boolean;
  sort: number;
  slokaIds: number[];
};

/** Saves a theme and its slokas in order (new when `id` is null). Returns its id or the message. */
export async function saveTheme(id: number | null, input: ThemeInput): Promise<{ id: number } | { errorKey: MessageKey }> {
  const row = {
    title: input.title,
    intro: input.intro,
    questions: input.questions,
    published: input.published,
    sample: input.sample,
    sort: input.sort,
  };
  const query = id === null
    ? supabase.from('ig_themes').insert(row).select('id').single<{ id: number }>()
    : supabase.from('ig_themes').update(row).eq('id', id).select('id').single<{ id: number }>();
  const { data, error } = await query;
  if (error || !data) return { errorKey: errorKeyOf(error?.message) };
  const linked = await supabase.rpc('set_theme_slokas', { p_theme: data.id, p_slokas: input.slokaIds });
  if (linked.error) return { errorKey: errorKeyOf(linked.error.message) };
  return { id: data.id };
}

/** Deletes a theme; its slokas stay. */
export async function deleteTheme(id: number): Promise<MessageKey | null> {
  const { error } = await supabase.from('ig_themes').delete().eq('id', id);
  return error ? errorKeyOf(error.message) : null;
}

/** Pins a published sloka as the sloka of the day on `day` ('YYYY-MM-DD'), replacing that day's pin. */
export async function pinSloka(slokaId: number, day: string): Promise<MessageKey | null> {
  const { error } = await supabase.from('ig_daily_pins').upsert({ day, sloka_id: slokaId });
  return error ? errorKeyOf(error.message) : null;
}

/** Takes the pin of a day away; the day goes back to the rotation. */
export async function unpinDay(day: string): Promise<MessageKey | null> {
  const { error } = await supabase.from('ig_daily_pins').delete().eq('day', day);
  return error ? errorKeyOf(error.message) : null;
}

// ---------------------------------------------------------------- recitation audio

/** The private Storage bucket (migration 0021). */
export const IG_AUDIO_BUCKET = 'ishtagoshti-audio';
/** Largest recitation the bucket takes: 10 MB. */
export const MAX_RECITATION_BYTES = 10 * 1024 * 1024;
/** The endings the bucket takes and the type sent with each. */
const AUDIO_TYPES: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  webm: 'audio/webm',
};

/** A picked or recorded file as a recitation, or the message why it cannot be one. */
function asRecitation(file: PickedMedia): PickedMedia | MessageKey {
  const ending = endingFor(file.name, file.mimeType);
  const mime = ending ? AUDIO_TYPES[ending] : undefined;
  if (!ending || !mime) return 'ishtagoshti.audio.notAudio';
  if (file.size > MAX_RECITATION_BYTES) return 'ishtagoshti.audio.tooBig';
  return { ...file, ending, mimeType: mime, kind: 'audio' };
}

/** Opens the file chooser for one audio file. */
export async function pickRecitation(): Promise<{ file?: PickedMedia; errorKey?: MessageKey }> {
  const result = await pickRecordingFiles(1);
  const picked = result.files[0];
  if (!picked) return { errorKey: result.errorKey };
  const file = asRecitation(picked);
  return typeof file === 'string' ? { errorKey: file } : { file };
}

/** A recording made in the app (components/audio-recorder.tsx) as a recitation file. */
export async function recordedRecitation(
  take: { uri: string; ending: string; mimeType: string; size: number; webFile?: Blob },
  ref: string,
): Promise<{ file?: PickedMedia; errorKey?: MessageKey }> {
  const media = await recordingAsMedia(take, ref.replace(/[^\p{L}\p{N} .-]/gu, '').trim() || 'Recitation');
  if (typeof media === 'string') return { errorKey: media };
  const file = asRecitation(media);
  return typeof file === 'string' ? { errorKey: file } : { file };
}

/** Uploads a recitation into the editor's folder. Returns the saved path and name, or the message. */
export async function uploadRecitation(myId: string, file: PickedMedia): Promise<{ path: string; name: string } | { errorKey: MessageKey }> {
  const path = `${myId}/${Crypto.randomUUID().toLowerCase()}.${file.ending}`;
  try {
    const { error } = await supabase.storage
      .from(IG_AUDIO_BUCKET)
      .upload(path, await bodyOf(file), { contentType: file.mimeType, upsert: false });
    if (!error) return { path, name: file.name };
    if (/maximum allowed size|too large|payload/i.test(error.message)) return { errorKey: 'ishtagoshti.audio.tooBig' };
    if (/mime type|not supported/i.test(error.message)) return { errorKey: 'ishtagoshti.audio.notAudio' };
    return { errorKey: errorKeyOf(error.message) };
  } catch (failure) {
    return { errorKey: errorKeyOf(String(failure)) };
  }
}

/** Removes a recitation file (an editor replacing or dropping it). False when it failed. */
export async function removeRecitation(path: string): Promise<boolean> {
  try {
    const { error } = await supabase.storage.from(IG_AUDIO_BUCKET).remove([path]);
    return !error;
  } catch {
    return false;
  }
}

/** A link to play a recitation that works for an hour; null when it could not be made. */
export async function recitationLink(path: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage.from(IG_AUDIO_BUCKET).createSignedUrl(path, 60 * 60);
    return error || !data ? null : data.signedUrl;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- errors

/** Error codes of migration 0021 that have their own message (ishtagoshti.errors.*). */
const KNOWN_ERRORS = [
  'ref_invalid',
  'devanagari_required',
  'transliteration_required',
  'text_too_long',
  'translation_required',
  'translator_too_long',
  'own_text_needed',
  'audio_invalid',
  'audio_missing',
  'theme_title_invalid',
  'pin_day_invalid',
  'pin_not_published',
  'too_many',
  'not_allowed',
] as const;

function errorKeyOf(message: string | undefined): MessageKey {
  if (!message) return 'common.genericError';
  if (isNetworkError(message)) return 'common.networkError';
  const code = (KNOWN_ERRORS as readonly string[]).find((c) => message === c);
  if (code) return `ishtagoshti.errors.${code as (typeof KNOWN_ERRORS)[number]}`;
  if (/row-level security|permission denied/i.test(message)) return 'ishtagoshti.errors.not_allowed';
  return 'common.genericError';
}
