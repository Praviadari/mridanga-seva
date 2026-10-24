// Saves that wait on this device for the signal (docs/DECISIONS.md #593; audit 22-10-2026 fix 18): a door check-in
// (a scanned code or a tapped name on Mark attendance) and a practice entry (the timer's Stop, the practice log's Save)
// that could not reach the server. lib/offline-send.ts sends them when the connection is back; this file only keeps
// the list (localStorage, like the practice timer), so it has no database code and the sign-out clean-up can load it.
//
// - Each entry keeps the request id its screen made (#322): a practice entry sent twice is saved once (log_practice's
//   twin), and a check-in is sent as "in", which changes nothing when the student is in already (mark_visit, #18).
// - Only what the save needs: no names, no photos. An entry is sent only while the login that made it is signed in,
//   and leaves the device as soon as the server answered (saved, or refused), or when it is too old to be saved
//   (a check-in of an earlier class day, practice older than the 14 days the log accepts). Sign-out deletes all of
//   it (lib/device-traces.ts).

import { useSyncExternalStore } from 'react';

import type { PhoneLocation } from './attendance-location';
import { readLocal, removeLocal, writeLocal } from './local-storage';

/** A practice entry as data/practice.ts logPractice takes it, and "How did it go?" (#494), saved after it. */
export type QueuedPractice = {
  minutes: number;
  source: 'timer' | 'manual';
  practisedOn?: string;
  startedAt?: string;
  taalId?: number | null;
  note?: string;
  feeling?: 1 | 2 | 3 | null;
  practised?: ('taal' | 'lesson' | 'free')[];
};

/** One waiting save. `at`: when it was made (ISO); `day`: the class's date then ('YYYY-MM-DD'). */
export type QueuedSave = { id: string; profileId: string; at: string; day: string } & (
  | { kind: 'practice'; practice: QueuedPractice }
  | { kind: 'scan'; qrToken: string; location: PhoneLocation | null }
  | { kind: 'mark'; studentId: string; action: 'in' | 'out'; location: PhoneLocation | null }
);

/** What the last sending did, for the screens' notice: saves the server refused, and saves too old to send. */
export type SendReport = { refused: number; tooOld: number };

const KEY = 'offlineQueue';
const REPORT_KEY = 'offlineQueueReport';
const listeners = new Set<() => void>();
let cached: { raw: string | null; value: QueuedSave[] } = { raw: null, value: [] };
let reportCache: { raw: string | null; value: SendReport | null } = { raw: null, value: null };

/** The waiting saves, oldest first. */
export function queuedSaves(): QueuedSave[] {
  const raw = readLocal(KEY);
  if (raw === cached.raw) return cached.value;
  let value: QueuedSave[] = [];
  try {
    const parsed: unknown = JSON.parse(raw ?? '[]');
    if (Array.isArray(parsed)) value = parsed.filter((item) => item && typeof item.id === 'string' && typeof item.profileId === 'string');
  } catch {
    value = [];
  }
  cached = { raw, value };
  return value;
}

function changed() {
  for (const listener of listeners) listener();
}

function store(items: QueuedSave[]) {
  if (items.length === 0) removeLocal(KEY);
  else writeLocal(KEY, JSON.stringify(items));
  changed();
}

/** Adds a save to the list; one with the same request id replaces the earlier copy (a second tap). */
export function enqueueSave(item: QueuedSave): void {
  store([...queuedSaves().filter((saved) => saved.id !== item.id), item]);
}

/** Takes saves off the list (sent, refused or too old). */
export function removeSaves(ids: readonly string[]): void {
  if (ids.length === 0) return;
  const gone = new Set(ids);
  store(queuedSaves().filter((item) => !gone.has(item.id)));
}

/** The report of the last sending, null when there is nothing to say. */
export function sendReport(): SendReport | null {
  const raw = readLocal(REPORT_KEY);
  if (raw === reportCache.raw) return reportCache.value;
  let value: SendReport | null = null;
  try {
    const parsed = JSON.parse(raw ?? 'null') as SendReport | null;
    if (parsed && (parsed.refused > 0 || parsed.tooOld > 0)) value = { refused: parsed.refused | 0, tooOld: parsed.tooOld | 0 };
  } catch {
    value = null;
  }
  reportCache = { raw, value };
  return value;
}

/** Adds to the report (refused and too-old saves are counted until the notice is closed). */
export function addToReport(more: SendReport): void {
  if (more.refused === 0 && more.tooOld === 0) return;
  const now = sendReport() ?? { refused: 0, tooOld: 0 };
  writeLocal(REPORT_KEY, JSON.stringify({ refused: now.refused + more.refused, tooOld: now.tooOld + more.tooOld }));
  changed();
}

/** Closes the report notice. */
export function clearReport(): void {
  removeLocal(REPORT_KEY);
  changed();
}

/** Deletes every waiting save and the report: at sign-out (lib/device-traces.ts). */
export function forgetOfflineQueue(): void {
  removeLocal(KEY);
  removeLocal(REPORT_KEY);
  changed();
}

/** Calls `listener` whenever the list or the report changes; returns the unsubscribe. */
export function onQueueChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** How many saves of `kinds` wait for this login, kept up to date. */
export function useQueuedCount(profileId: string | undefined, kinds: readonly QueuedSave['kind'][]): number {
  const items = useSyncExternalStore(onQueueChange, queuedSaves, queuedSaves);
  return profileId ? items.filter((item) => item.profileId === profileId && kinds.includes(item.kind)).length : 0;
}

/** The report of the last sending, kept up to date. */
export function useSendReport(): SendReport | null {
  return useSyncExternalStore(onQueueChange, sendReport, sendReport);
}

// ---------------------------------------------------------------- what can still be sent

/** Longest a timer entry may wait and still be sent as a timer (the database takes starts of the last 6 hours). */
export const TIMER_SEND_MS = 6 * 60 * 60 * 1000 - 5 * 60 * 1000;
/** Oldest practice day the log accepts: today and the 13 days before (0018 log_practice). */
export const PRACTICE_DAYS_BACK = 13;

/** Whole days from `from` to `to` ('YYYY-MM-DD' each). */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/**
 * What to send for a waiting save at the moment `now`, or null when it is too old to be saved:
 * - a check-in only on the class day it was made (sent later it would count a visit on the wrong day);
 * - a timer entry as made while its start is under 6 hours old, then as an entry typed for the day it was stopped
 *   (the log accepts the last 14 days; the minutes were counted at Stop, so they are the same);
 * - a typed entry while its day is within the last 14 days.
 * @param today the class's date at `now` ('YYYY-MM-DD').
 */
export function sendable(item: QueuedSave, now: number, today: string): QueuedSave | null {
  if (item.kind !== 'practice') return item.day === today ? item : null;
  const { practice } = item;
  if (practice.source === 'timer' && practice.startedAt) {
    if (now - Date.parse(practice.startedAt) < TIMER_SEND_MS) return item;
    if (daysBetween(item.day, today) > PRACTICE_DAYS_BACK) return null;
    const typed: QueuedPractice = { ...practice, source: 'manual', practisedOn: item.day };
    delete typed.startedAt;
    return { ...item, practice: typed };
  }
  const day = practice.practisedOn ?? item.day;
  return daysBetween(day, today) > PRACTICE_DAYS_BACK ? null : { ...item, practice: { ...practice, practisedOn: day } };
}
