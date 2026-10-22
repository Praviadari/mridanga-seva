// A student's own bests in the creative practice tools (docs/DECISIONS.md #470-#472): the best cycle of the tap-pad
// play-along and of Echo me per taal (most stars, then the faster tempo), and the most "Which bol?" answers in a row
// per level and kind. Kept on this device only, for the person signed in; never sent, never shown to anyone else, and
// wiped at sign-out with the other traces (lib/device-traces.ts). The phone's tap delay ("Tune to this phone") belongs
// to the phone, not the person, and stays.

import { readLocal, removeLocal, writeLocal } from './local-storage';

/** The best cycle: its stars (0-3) and the tempo it was played at. */
export type TapBest = { stars: number; bpm: number };

type Store = { profileId: string; tap: Record<string, TapBest>; quiz: Record<string, number> };

const KEY = 'playBests';
const OFFSET_KEY = 'tapOffsetMs';

function read(profileId: string): Store {
  try {
    const parsed = JSON.parse(readLocal(KEY) ?? 'null') as Store | null;
    if (parsed && parsed.profileId === profileId && parsed.tap && parsed.quiz) return parsed;
  } catch {
    // Unreadable: start again.
  }
  return { profileId, tap: {}, quiz: {} };
}

/** True when `next` beats `best`: more stars, or as many at a faster tempo. */
export function betterTap(next: TapBest, best: TapBest | null): boolean {
  if (!best) return next.stars > 0;
  return next.stars > best.stars || (next.stars === best.stars && next.stars > 0 && next.bpm > best.bpm);
}

/** The best cycle kept for `key` (a tool and a taal, e.g. "pad:3"). */
export function tapBest(profileId: string, key: string): TapBest | null {
  return read(profileId).tap[key] ?? null;
}

/** Keeps `next` when it beats the best; true when it did (a new best). */
export function saveTapBest(profileId: string, key: string, next: TapBest): boolean {
  const store = read(profileId);
  if (!betterTap(next, store.tap[key] ?? null)) return false;
  store.tap[key] = next;
  writeLocal(KEY, JSON.stringify(store));
  return true;
}

/** The most answers in a row kept for `key` (a level and single bols or phrases, e.g. "1:bols"). */
export function quizBest(profileId: string, key: string): number {
  return read(profileId).quiz[key] ?? 0;
}

/** Keeps `inARow` when it is more than the best; true when it is. */
export function saveQuizBest(profileId: string, key: string, inARow: number): boolean {
  const store = read(profileId);
  if (inARow <= (store.quiz[key] ?? 0)) return false;
  store.quiz[key] = inARow;
  writeLocal(KEY, JSON.stringify(store));
  return true;
}

/** Forgets every best on this device (sign-out). */
export function forgetPlayBests(): void {
  removeLocal(KEY);
}

/** The phone's tap delay found with "Tune to this phone", ms (0 until tuned). */
export function tapOffset(): number {
  const value = Number(readLocal(OFFSET_KEY));
  return Number.isFinite(value) && Math.abs(value) <= 400 ? value : 0;
}

export function saveTapOffset(ms: number): void {
  writeLocal(OFFSET_KEY, String(Math.round(ms)));
}

/** True when this phone was tuned. */
export function tapTuned(): boolean {
  return readLocal(OFFSET_KEY) !== null;
}
