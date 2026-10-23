// Practice while waiting for the desk (migration 0057, docs/DECISIONS.md #510-#512; audit 22-10-2026 fix 8): a login
// that signed up and waits for a coordinator's Accept may use the practice tools, the mantra before practice and the
// Beginner lesson videos. The database decides who may (practice_while_waiting(): an adult by the sign-up's date of
// birth, or a child whose parent consented; never a child before the consent, #399) and row-level security gives only
// class content, nothing personal.
//
// Both answers are kept on this device for the web version offline (the service worker keeps the app itself, #513):
// the "may practise" answer per login and the Beginner lessons' titles and links (data/waiting-store.ts). Sign-out
// forgets them with the other traces (lib/device-traces.ts).

import { supabase } from '@/lib/supabase';

import { fetchMaterials, lessonSourceOf } from './materials';
import { saveBeginnerLessons, savedBeginnerLessons, savedWaitingAccess, saveWaitingAccess, type WaitingAccess, type WaitingLesson } from './waiting-store';

export { savedBeginnerLessons, savedWaitingAccess, type WaitingAccess, type WaitingLesson } from './waiting-store';

/**
 * Asks the database whether this login may practise while waiting. Before 0057 the function is missing: null (the
 * waiting page then shows no practice). Without an answer (offline), the copy saved on this device, else null.
 */
export async function fetchWaitingAccess(profileId: string): Promise<WaitingAccess> {
  const { data, error } = await supabase.rpc('practice_while_waiting');
  if (error) return error.code === 'PGRST202' ? null : (savedWaitingAccess(profileId) ?? null);
  const level = typeof data === 'number' ? data : null;
  saveWaitingAccess(profileId, level);
  return level;
}

/**
 * The Beginner lesson videos (row-level security gives a waiting login only those). null = could not load and no copy
 * on this device; `saved` = the copy kept on this device (offline web).
 */
export async function fetchBeginnerLessons(levelId: number): Promise<{ lessons: WaitingLesson[]; saved: boolean } | null> {
  const loaded = await fetchMaterials(levelId);
  if (loaded) {
    const lessons = loaded
      .filter((m) => m.levelId === levelId && lessonSourceOf(m) !== null)
      .map(({ id, title, kind, url, body }) => ({ id, title, kind, url, body }));
    saveBeginnerLessons(lessons);
    return { lessons, saved: false };
  }
  const saved = savedBeginnerLessons();
  return saved ? { lessons: saved, saved: true } : null;
}
