// Mantras read before practice (docs/DECISIONS.md #405): the mridanga pranam, a guru pranam, ... The text comes only
// from the Guru (or an Ishtagoshti editor) in the app; nothing is built in. Table practice_mantras
// (supabase/migrations/0052_practice_more.sql): everyone with a class role reads the ones switched on, editors read all
// and write. The last list loaded is kept on this device, so the reader works offline after the first load.

import { readLocal, writeLocal } from '@/lib/local-storage';
import { supabase } from '@/lib/supabase';

import { fallbackErrorKey, isNetworkError, type MessageKey } from './errors';

/** The scripts a mantra may be written in. */
export type MantraScript = 'devanagari' | 'telugu' | 'roman';
export const MANTRA_SCRIPTS: readonly MantraScript[] = ['devanagari', 'telugu', 'roman'];

/** The languages of a meaning. */
export type MantraLanguage = 'en' | 'te' | 'hi';
export const MANTRA_LANGUAGES: readonly MantraLanguage[] = ['en', 'te', 'hi'];

/** One mantra. */
export type Mantra = {
  id: number;
  title: string;
  text: Record<MantraScript, string | null>;
  meaning: Record<MantraLanguage, string | null>;
  source: string | null;
  sort: number;
  active: boolean;
};

/** Limits, as in the database. */
export const MANTRA_TITLE_MAX = 80;
export const MANTRA_TEXT_MAX = 3000;
export const MANTRA_MEANING_MAX = 2000;
export const MANTRA_SOURCE_MAX = 200;

type MantraRow = {
  id: number;
  title: string;
  devanagari: string | null;
  telugu: string | null;
  roman: string | null;
  meaning_en: string | null;
  meaning_te: string | null;
  meaning_hi: string | null;
  source: string | null;
  sort: number;
  active: boolean;
};

const COLUMNS = 'id, title, devanagari, telugu, roman, meaning_en, meaning_te, meaning_hi, source, sort, active';

function mantraOf(row: MantraRow): Mantra {
  return {
    id: row.id,
    title: row.title,
    text: { devanagari: row.devanagari, telugu: row.telugu, roman: row.roman },
    meaning: { en: row.meaning_en, te: row.meaning_te, hi: row.meaning_hi },
    source: row.source,
    sort: row.sort,
    active: row.active,
  };
}

/** Device storage key for the last mantras loaded (switched on only). */
const SAVED_KEY = 'practiceMantras';

/** The mantras to read. `saved` = no connection: the copy on this device is shown. */
export type MantraList = { mantras: Mantra[]; saved: boolean };

/** The mantras in order (editors also get the switched-off ones), keeping a copy on the device. */
export async function fetchMantras(): Promise<MantraList> {
  const { data, error } = await supabase.from('practice_mantras').select(COLUMNS).order('sort').order('id');
  if (!error) {
    const mantras = (data as MantraRow[]).map(mantraOf);
    writeLocal(SAVED_KEY, JSON.stringify(mantras.filter((m) => m.active)));
    return { mantras, saved: false };
  }
  return { mantras: savedMantras(), saved: true };
}

/** The copy on this device (empty when none was ever loaded). */
export function savedMantras(): Mantra[] {
  try {
    const saved = JSON.parse(readLocal(SAVED_KEY) ?? '[]') as Mantra[];
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

/** One mantra for the editor. null = not found or could not be loaded. */
export async function fetchMantra(id: number): Promise<Mantra | null> {
  const { data, error } = await supabase.from('practice_mantras').select(COLUMNS).eq('id', id).maybeSingle<MantraRow>();
  return error || !data ? null : mantraOf(data);
}

/** What the editor saves. */
export type MantraInput = Omit<Mantra, 'id'>;

const CODES = ['mantra_title_invalid', 'mantra_text_required', 'mantra_text_too_long', 'mantra_source_too_long'] as const;

function mantraErrorKey(message: string | undefined): MessageKey {
  if (!message) return 'common.genericError';
  if (isNetworkError(message)) return 'common.networkError';
  const code = CODES.find((c) => message === c);
  if (code) return `mantras.errors.${code}` as MessageKey;
  if (/row-level security|permission denied/i.test(message)) return 'mantras.errors.not_allowed';
  return fallbackErrorKey(message);
}

/** Saves a mantra (new when `id` is null). Returns its id or the message to show. */
export async function saveMantra(id: number | null, input: MantraInput): Promise<{ id: number } | { errorKey: MessageKey }> {
  const row = {
    title: input.title,
    devanagari: input.text.devanagari ?? '',
    telugu: input.text.telugu ?? '',
    roman: input.text.roman ?? '',
    meaning_en: input.meaning.en ?? '',
    meaning_te: input.meaning.te ?? '',
    meaning_hi: input.meaning.hi ?? '',
    source: input.source ?? '',
    sort: input.sort,
    active: input.active,
  };
  const query =
    id === null
      ? supabase.from('practice_mantras').insert(row).select('id').single<{ id: number }>()
      : supabase.from('practice_mantras').update(row).eq('id', id).select('id').single<{ id: number }>();
  const { data, error } = await query;
  if (error || !data) return { errorKey: mantraErrorKey(error?.message) };
  return { id: data.id };
}

/** Deletes a mantra. null = deleted. */
export async function deleteMantra(id: number): Promise<MessageKey | null> {
  const { error } = await supabase.from('practice_mantras').delete().eq('id', id);
  return error ? mantraErrorKey(error.message) : null;
}

/** The scripts a mantra is written in, in the switch's order. */
export function scriptsOf(mantra: Mantra): MantraScript[] {
  return MANTRA_SCRIPTS.filter((s) => mantra.text[s]);
}

/** The script to show first: the reader's language's (te → Telugu, hi → Devanagari), else the first written. */
export function firstScript(mantra: Mantra, language: string): MantraScript | null {
  const scripts = scriptsOf(mantra);
  const wanted: MantraScript = language === 'te' ? 'telugu' : language === 'hi' ? 'devanagari' : 'roman';
  return scripts.includes(wanted) ? wanted : scripts[0] ?? null;
}
