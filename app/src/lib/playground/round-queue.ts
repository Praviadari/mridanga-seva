// Playground rounds on this device (docs/RHYTHM_PLAYGROUND.md §8.6 rule 6, §9.3; #728):
//   - the queue: finished (or left) rounds waiting to be saved. Each keeps the id its round was made with, the
//     request id of record_round, so a round sent twice (a lost answer, two phones online) is saved once. Sent
//     oldest first while the login that played them is signed in; it leaves the queue when the server answered
//     (saved or refused) or when it is older than the server takes (14 days);
//   - the history: this login's rounds of the last 30 days (sent or not), for the repeat guard, spaced review
//     and labels before the server's list is loaded.
// localStorage only (as lib/offline-queue.ts), no database code; sign-out deletes both (lib/device-traces.ts).

import { useSyncExternalStore } from 'react';

import { readLocal, removeLocal, writeLocal } from '@/lib/local-storage';

import type { PlayedRound } from './types';

export type QueuedRound = { profileId: string; round: PlayedRound };

/** What sending one round did. */
export type SendOutcome = 'saved' | 'refused' | 'offline';

const QUEUE_KEY = 'playgroundQueue';
const HISTORY_KEY = 'playgroundHistory';
/** record_round takes rounds started in the last 14 days. */
export const ROUND_SEND_DAYS = 14;
export const HISTORY_DAYS = 30;
export const HISTORY_MAX = 400;
const DAY_MS = 24 * 60 * 60 * 1000;

const listeners = new Set<() => void>();
const caches = new Map<string, { raw: string | null; value: unknown[] }>();

function readList<T>(key: string, ok: (item: unknown) => boolean): T[] {
  const raw = readLocal(key);
  const hit = caches.get(key);
  if (hit && hit.raw === raw) return hit.value as T[];
  let value: unknown[] = [];
  try {
    const parsed: unknown = JSON.parse(raw ?? '[]');
    if (Array.isArray(parsed)) value = parsed.filter(ok);
  } catch {
    value = [];
  }
  caches.set(key, { raw, value });
  return value as T[];
}

function writeList(key: string, items: unknown[]) {
  if (items.length === 0) removeLocal(key);
  else writeLocal(key, JSON.stringify(items));
  for (const listener of listeners) listener();
}

const isQueued = (item: unknown) => {
  const q = item as QueuedRound | null;
  return Boolean(q && typeof q.profileId === 'string' && q.round && typeof q.round.id === 'string');
};

/** Every waiting round, oldest first. */
export function queuedRounds(): QueuedRound[] {
  return readList<QueuedRound>(QUEUE_KEY, isQueued);
}

/** Puts a round in the queue and the history; the same id replaces the earlier copy. */
export function enqueueRound(profileId: string, round: PlayedRound): void {
  writeList(QUEUE_KEY, [...queuedRounds().filter((q) => q.round.id !== round.id), { profileId, round }]);
  rememberRounds(profileId, [round]);
}

/** Takes rounds off the queue (saved, refused, too old). */
export function removeQueuedRounds(ids: readonly string[]): void {
  if (ids.length === 0) return;
  const gone = new Set(ids);
  writeList(QUEUE_KEY, queuedRounds().filter((q) => !gone.has(q.round.id)));
}

/** This login's rounds of the last 30 days on this device (history and queue), newest first. */
export function recentRounds(profileId: string, now: number = Date.now()): PlayedRound[] {
  return readList<QueuedRound>(HISTORY_KEY, isQueued)
    .filter((q) => q.profileId === profileId && now - Date.parse(q.round.startedAt) < HISTORY_DAYS * DAY_MS)
    .map((q) => q.round)
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
}

/** Adds rounds to the history (the server's list after loading, or a round just played); by id, newest kept. */
export function rememberRounds(profileId: string, rounds: readonly PlayedRound[], now: number = Date.now()): void {
  const ids = new Set(rounds.map((r) => r.id));
  const kept = readList<QueuedRound>(HISTORY_KEY, isQueued).filter(
    (q) => !ids.has(q.round.id) && now - Date.parse(q.round.startedAt) < HISTORY_DAYS * DAY_MS,
  );
  const all = [...kept, ...rounds.map((round) => ({ profileId, round }))]
    .sort((a, b) => Date.parse(a.round.startedAt) - Date.parse(b.round.startedAt))
    .slice(-HISTORY_MAX);
  writeList(HISTORY_KEY, all);
}

/** Merges the saved rounds (server) with the phone's: one per id, newest first. */
export function mergeRounds(saved: readonly PlayedRound[], local: readonly PlayedRound[]): PlayedRound[] {
  const byId = new Map<string, PlayedRound>();
  for (const r of [...local, ...saved]) byId.set(r.id, r);
  return [...byId.values()].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
}

let sending: Promise<SyncReport> | null = null;

export type SyncReport = { saved: number; refused: number; tooOld: number; waiting: number };

/**
 * Sends this login's waiting rounds, oldest first, one at a time; stops at the first "offline". Only one sending
 * runs at a time (a second call gets the running one's report).
 */
export function syncRounds(profileId: string, send: (round: PlayedRound) => Promise<SendOutcome>, now: number = Date.now()): Promise<SyncReport> {
  if (sending) return sending;
  sending = (async () => {
    const report: SyncReport = { saved: 0, refused: 0, tooOld: 0, waiting: 0 };
    try {
      const mine = queuedRounds()
        .filter((q) => q.profileId === profileId)
        .sort((a, b) => Date.parse(a.round.startedAt) - Date.parse(b.round.startedAt));
      for (let i = 0; i < mine.length; i++) {
        const { round } = mine[i];
        if (now - Date.parse(round.startedAt) >= ROUND_SEND_DAYS * DAY_MS) {
          removeQueuedRounds([round.id]);
          report.tooOld++;
          continue;
        }
        const outcome = await send(round);
        if (outcome === 'offline') {
          report.waiting = mine.length - i;
          break;
        }
        removeQueuedRounds([round.id]);
        report[outcome]++;
      }
    } finally {
      sending = null;
    }
    return report;
  })();
  return sending;
}

/** Deletes the queue and the history: at sign-out (lib/device-traces.ts). */
export function forgetPlayground(): void {
  removeLocal(QUEUE_KEY);
  removeLocal(HISTORY_KEY);
  for (const listener of listeners) listener();
}

export function onRoundsChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** How many rounds of this login wait to be saved, kept up to date. */
export function useQueuedRoundCount(profileId: string | undefined): number {
  const items = useSyncExternalStore(onRoundsChange, queuedRounds, queuedRounds);
  return profileId ? items.filter((q) => q.profileId === profileId).length : 0;
}
