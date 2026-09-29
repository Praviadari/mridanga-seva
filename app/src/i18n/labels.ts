// Small helpers that turn values stored as numbers or codes into words in the app's language:
// a level's name, a length of time. Used by several screens, so the wording is the same everywhere.

import type { TFunction } from 'i18next';

/**
 * The level's name in the app's language. The three levels (Beginner, Intermediate, Advanced)
 * are created by migration 0001 and do not change, so they are translated by id; a level added
 * later shows `fallback` (its name from the database), or the id when no name was loaded.
 */
export function levelName(t: TFunction, levelId: number, fallback?: string): string {
  switch (levelId) {
    case 1:
      return t('levels.1');
    case 2:
      return t('levels.2');
    case 3:
      return t('levels.3');
    default:
      return fallback ?? String(levelId);
  }
}

/** A length of time given in whole minutes, e.g. 105 → "1 h 45 min", 40 → "40 min". */
export function formatDuration(t: TFunction, totalMinutes: number): string {
  const minutes = Math.max(0, Math.round(totalMinutes));
  if (minutes < 60) return t('time.minutes', { minutes });
  return t('time.hoursMinutes', { hours: Math.floor(minutes / 60), minutes: minutes % 60 });
}
