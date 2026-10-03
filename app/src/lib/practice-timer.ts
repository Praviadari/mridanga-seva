// The S5 practice timer: started by hand or by the first sound of the metronome or taal player, and
// stopped by the student, when it logs itself (at least one minute; data/practice.ts logPractice).
// The start time is kept on this device, so the timer survives leaving the screen, a reload or a
// restart of the app. One timer per device and login.

import { useSyncExternalStore } from 'react';

import { readLocal, removeLocal, writeLocal } from './local-storage';

/** A running timer. */
export type RunningTimer = { profileId: string; startedAt: string; taalId: number | null };

const KEY = 'practiceTimer';
const listeners = new Set<() => void>();
let cached: { raw: string | null; value: RunningTimer | null } = { raw: null, value: null };

function read(): RunningTimer | null {
  const raw = readLocal(KEY);
  if (raw === cached.raw) return cached.value;
  let value: RunningTimer | null = null;
  try {
    const parsed = JSON.parse(raw ?? 'null') as RunningTimer | null;
    if (parsed && typeof parsed.startedAt === 'string' && typeof parsed.profileId === 'string') value = parsed;
  } catch {
    value = null;
  }
  cached = { raw, value };
  return value;
}

function changed() {
  for (const listener of listeners) listener();
}

/** Starts the timer for this login, unless one is running. */
export function startPracticeTimer(profileId: string, taalId: number | null): void {
  const running = read();
  if (running && running.profileId === profileId) return;
  writeLocal(KEY, JSON.stringify({ profileId, startedAt: new Date().toISOString(), taalId }));
  changed();
}

/** Remembers the taal played last, to log with the time. */
export function setPracticeTimerTaal(taalId: number | null): void {
  const running = read();
  if (!running || running.taalId === taalId) return;
  writeLocal(KEY, JSON.stringify({ ...running, taalId }));
  changed();
}

/** Forgets the timer (after logging it, or when it is thrown away). */
export function clearPracticeTimer(): void {
  removeLocal(KEY);
  changed();
}

/** The running timer of this login, kept up to date. */
export function usePracticeTimer(profileId: string): RunningTimer | null {
  const timer = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    read,
    read,
  );
  return timer && timer.profileId === profileId ? timer : null;
}

/** Longest time a timer may run before it counts as forgotten (the database refuses older starts). */
export const TIMER_LIMIT_MS = 6 * 60 * 60 * 1000;
/** Most minutes one entry may hold. */
export const MAX_ENTRY_MINUTES = 240;
