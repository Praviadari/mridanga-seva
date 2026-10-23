// What data/waiting.ts keeps on this device for a login waiting for the desk (0057, docs/DECISIONS.md #510): the
// "may practise" answer of that login and the Beginner lessons list (class content). Apart from data/waiting.ts so the
// sign-out clean-up (lib/device-traces.ts) needs nothing but the device's store.

import { readLocal, removeLocal, writeLocal } from '@/lib/local-storage';

const ACCESS_KEY = 'waitingPractice';
const LESSONS_KEY = 'waitingLessons';

/** A Beginner lesson as the waiting page lists it. */
export type WaitingLesson = { id: number; title: string; kind: 'youtube' | 'video' | 'pdf' | 'image' | 'note'; url: string | null; body: string | null };

/** The first level's id when this login may practise while waiting, else null. */
export type WaitingAccess = number | null;

/** The answer saved on this device for `profileId`, or undefined when there is none. */
export function savedWaitingAccess(profileId: string): WaitingAccess | undefined {
  try {
    const saved = JSON.parse(readLocal(ACCESS_KEY) ?? 'null') as { id: string; level: number | null } | null;
    return saved && saved.id === profileId ? saved.level : undefined;
  } catch {
    return undefined;
  }
}

/** Keeps the answer for `profileId`. */
export function saveWaitingAccess(profileId: string, level: WaitingAccess): void {
  writeLocal(ACCESS_KEY, JSON.stringify({ id: profileId, level }));
}

/** The Beginner lessons last loaded on this device, or null. */
export function savedBeginnerLessons(): WaitingLesson[] | null {
  try {
    const saved = JSON.parse(readLocal(LESSONS_KEY) ?? 'null') as WaitingLesson[] | null;
    return Array.isArray(saved) ? saved : null;
  } catch {
    return null;
  }
}

/** Keeps the Beginner lessons list. */
export function saveBeginnerLessons(lessons: readonly WaitingLesson[]): void {
  writeLocal(LESSONS_KEY, JSON.stringify(lessons));
}

/** Forgets both (sign-out, lib/device-traces.ts). */
export function forgetWaitingPractice(): void {
  removeLocal(ACCESS_KEY);
  removeLocal(LESSONS_KEY);
}
