// Continue learning (docs/DECISIONS.md #787): the chapter the student opened last, for the "Continue learning" rows on
// the Learn tab and on My Learning. Kept on this device only, for the person signed in; never sent, and wiped at
// sign-out with the other traces (lib/device-traces.ts). Its title is kept with it, so the Learn tab (first web
// download, #650) can name it without loading the syllabus; the chapter screen checks the item is still in the level.

import { readLocal, removeLocal, writeLocal } from './local-storage';

/** The last chapter: the syllabus item, its title and its lesson's (a section; null = a lesson of one item). */
export type LastChapter = { profileId: string; itemId: number; title: string; lesson: string | null };

const KEY = 'lastChapter';

/** The last chapter of `profileId` on this device, or null. */
export function lastChapter(profileId: string): LastChapter | null {
  if (!profileId) return null;
  try {
    const parsed = JSON.parse(readLocal(KEY) ?? 'null') as LastChapter | null;
    if (parsed && parsed.profileId === profileId && Number.isInteger(parsed.itemId) && typeof parsed.title === 'string') return parsed;
  } catch {
    // Unreadable: nothing to continue.
  }
  return null;
}

/** Remembers the chapter just opened. */
export function saveLastChapter(chapter: LastChapter): void {
  if (chapter.profileId) writeLocal(KEY, JSON.stringify(chapter));
}

/** Forgets it (sign-out). */
export function forgetLastChapter(): void {
  removeLocal(KEY);
}
