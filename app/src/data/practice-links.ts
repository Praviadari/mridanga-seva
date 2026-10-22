// "Learn more" under Practice (docs/DECISIONS.md #474): free material elsewhere that the Guru trusts, each a title, an
// https link and a short note. Table practice_links (supabase/migrations/0055_practice_links.sql): everyone with a class
// role reads the ones switched on, the Guru reads all and writes. The last list loaded is kept on this device, so it
// shows offline too (the links themselves need the internet).

import { readLocal, writeLocal } from '@/lib/local-storage';
import { supabase } from '@/lib/supabase';

import { fallbackErrorKey, isNetworkError, type MessageKey } from './errors';

/** One link. */
export type PracticeLink = { id: number; title: string; url: string; note: string | null; sort: number; active: boolean };

/** Limits, as in the database. */
export const LINK_TITLE_MAX = 80;
export const LINK_URL_MAX = 500;
export const LINK_NOTE_MAX = 200;

const COLUMNS = 'id, title, url, note, sort, active';
const SAVED_KEY = 'practiceLinks';

/** The links to show. `saved` = no connection: the copy on this device. */
export type LinkList = { links: PracticeLink[]; saved: boolean };

/** The links in order (the Guru also gets the switched-off ones), keeping a copy on the device. */
export async function fetchPracticeLinks(): Promise<LinkList> {
  const { data, error } = await supabase.from('practice_links').select(COLUMNS).order('sort').order('id');
  if (!error) {
    const links = data as PracticeLink[];
    writeLocal(SAVED_KEY, JSON.stringify(links.filter((l) => l.active)));
    return { links, saved: false };
  }
  return { links: savedPracticeLinks(), saved: true };
}

/** The copy on this device (empty when none was ever loaded). */
export function savedPracticeLinks(): PracticeLink[] {
  try {
    const saved = JSON.parse(readLocal(SAVED_KEY) ?? '[]') as PracticeLink[];
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

/** The same check as the database: an https link to a site with a dot in its name, no spaces, at most 500. */
export function linkUrlOk(url: string): boolean {
  const value = url.trim();
  return value.length <= LINK_URL_MAX && /^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(:[0-9]{1,5})?([/?#][^\s]*)?$/i.test(value);
}

/** The site's name to show under a link ("www.kksongs.org" → "kksongs.org"), so a child sees where it goes. */
export function linkSite(url: string): string {
  const host = url.trim().replace(/^https:\/\//i, '').split(/[/?#:]/)[0] ?? '';
  return host.replace(/^www\./i, '').toLowerCase();
}

/** What the Guru saves. */
export type LinkInput = Omit<PracticeLink, 'id'>;

const CODES = ['link_title_invalid', 'link_url_invalid', 'link_note_too_long'] as const;

function linkErrorKey(message: string | undefined): MessageKey {
  if (!message) return 'common.genericError';
  if (isNetworkError(message)) return 'common.networkError';
  const code = CODES.find((c) => message === c);
  if (code) return `learnMore.errors.${code}` as MessageKey;
  if (/row-level security|permission denied/i.test(message)) return 'learnMore.errors.not_allowed';
  return fallbackErrorKey(message);
}

/** Saves a link (new when `id` is null). Returns its id or the message to show. */
export async function savePracticeLink(id: number | null, input: LinkInput): Promise<{ id: number } | { errorKey: MessageKey }> {
  const row = { title: input.title, url: input.url.trim(), note: input.note ?? '', sort: input.sort, active: input.active };
  const query =
    id === null
      ? supabase.from('practice_links').insert(row).select('id').single<{ id: number }>()
      : supabase.from('practice_links').update(row).eq('id', id).select('id').single<{ id: number }>();
  const { data, error } = await query;
  if (error || !data) return { errorKey: linkErrorKey(error?.message) };
  return { id: data.id };
}

/** Deletes a link. null = deleted. */
export async function deletePracticeLink(id: number): Promise<MessageKey | null> {
  const { error } = await supabase.from('practice_links').delete().eq('id', id);
  return error ? linkErrorKey(error.message) : null;
}
