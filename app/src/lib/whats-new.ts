// What's new: the release notes behind the info icon on My profile (docs/DECISIONS.md #406). The notes live in one
// bundled file, src/content/whats-new.json, so every update carries its own notes: no table, no migration. The newest
// published entry is always the one running, because the file came in the same bundle; an entry without a date is
// not published yet ("Coming in the next update"). scripts/lib/whats-new-check.mjs stops a production update whose
// newest entry is a draft or older than the code (docs/OPERATIONS.md "Publishing an update").
// Pure helpers here; the screen is src/screens/whats-new.tsx.

import { readLocal, writeLocal } from './local-storage';

/** The languages the notes are written in. */
export type NotesLanguage = 'en' | 'te' | 'hi';

/** One release in src/content/whats-new.json. Keys starting with "_" are notes for the team and ignored. */
export type Release = {
  /** The app version from app.json, e.g. "1.0.0". */
  version: string;
  /** 'installed': an APK; 'update': an update sent to the installed app. */
  kind: 'installed' | 'update';
  /** The APK's build id or the update id the version line shows (8 characters); null until known. */
  id: string | null;
  /** The day it was published (YYYY-MM-DD); null while it waits for the next update. */
  date: string | null;
  /** 3-8 plain lines per language, the same number in each. */
  notes: Record<NotesLanguage, string[]>;
};

/** Where this device remembers the newest release its person has opened What's new for. */
export const SEEN_KEY = 'whatsNewSeen';

/** The newest published release: the one this bundle is. Undefined when none has a date yet. */
export function currentRelease(releases: readonly Release[]): Release | undefined {
  return releases.find((release) => release.date !== null);
}

/** A key for "this release" on this device: its date and id (a published release has a date). */
export function releaseKey(release: Release): string {
  return `${release.date ?? 'next'} ${release.id ?? ''}`.trim();
}

/** The lines of a release in the reader's language; English where that language has none. */
export function releaseNotes(release: Release, language: string): string[] {
  const lines = release.notes[language as NotesLanguage];
  return lines && lines.length > 0 ? lines : release.notes.en;
}

/** True when the newest published release has not been opened on this device yet: the dot on the icon. */
export function whatsNewUnseen(releases: readonly Release[], seen: string | null = readLocal(SEEN_KEY)): boolean {
  const current = currentRelease(releases);
  return !!current && seen !== releaseKey(current);
}

/** Remembers on this device that What's new was opened for the newest release, so the dot goes. */
export function markWhatsNewSeen(releases: readonly Release[]): void {
  const current = currentRelease(releases);
  if (current) writeLocal(SEEN_KEY, releaseKey(current));
}
