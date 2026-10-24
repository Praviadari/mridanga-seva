// Sends the saves that waited on this device (lib/offline-queue.ts, docs/DECISIONS.md #593) once the connection is
// back: when the app starts or comes to the front, when the browser says it is online again, every 30 seconds while
// something waits, and from the "Send now" button. One sending at a time, oldest first; the first "no connection"
// stops it until the next try. The root layout runs it for the signed-in login (useQueueSender).
//
// - Practice: logPractice with the entry's own request id, so an entry the server saved before its answer was lost
//   is saved once (log_practice's twin, 0054).
// - A tapped name: mark_visit with the button's meaning; "already in" or "already out" is fine, nothing doubles (#18).
// - A scanned code: scan_qr toggles, so a resend could check the student out again. It is sent only when the student
//   is not checked in today (checkedInTokens); when they are, the wait is over and nothing is sent.
// - The time the database records for a check-in is when it arrives; the screens say so (no migration, #593).

import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import { checkedInTokens, markVisit, scanStudentQr } from '@/data/attendance';
import { logPractice, setPracticeFeeling } from '@/data/practice';

import type { PhoneLocation } from './attendance-location';
import { todayLocal } from './dates';
import { addToReport, enqueueSave, queuedSaves, removeSaves, sendable, type QueuedPractice, type QueuedSave } from './offline-queue';

/** How often to try while something waits, in milliseconds. */
export const RETRY_MS = 30_000;

/** The message key a save gets when the server could not be reached (data/errors.ts): the cue to queue it. */
export const NETWORK = 'common.networkError';

/** Keeps a practice entry that found no connection, under the request id its screen sent it with. */
export function queuePractice(profileId: string, requestId: string, practice: QueuedPractice): void {
  enqueueSave({ id: requestId, profileId, at: new Date().toISOString(), day: todayLocal(), kind: 'practice', practice });
}

/** Keeps a door check-in that found no connection: a scanned code (always sent as "in"), or a tapped name. */
export function queueCheckIn(
  profileId: string,
  requestId: string,
  what: { qrToken: string } | { studentId: string; action: 'in' | 'out' },
  location: PhoneLocation | null,
): void {
  const base = { id: requestId, profileId, at: new Date().toISOString(), day: todayLocal() };
  enqueueSave('qrToken' in what ? { ...base, kind: 'scan', qrToken: what.qrToken, location } : { ...base, kind: 'mark', ...what, location });
}

/** What one waiting save came to: saved (or nothing to do), refused by the server, or no connection. */
type Outcome = 'saved' | 'refused' | 'offline';

async function sendOne(item: QueuedSave, inToday: () => Promise<Set<string> | null>): Promise<Outcome> {
  if (item.kind === 'practice') {
    const { feeling, practised, ...entry } = item.practice;
    const result = await logPractice(entry, item.id);
    if ('errorKey' in result) return result.errorKey === NETWORK ? 'offline' : 'refused';
    // How it went goes after the entry; the entry stays saved if this fails (as on the practice log, #494).
    if (result.id !== null && (feeling || practised?.length)) await setPracticeFeeling(result.id, feeling ?? null, practised ?? []);
    return 'saved';
  }
  if (item.kind === 'scan') {
    const checkedIn = await inToday();
    if (!checkedIn) return 'offline';
    if (checkedIn.has(item.qrToken.toLowerCase())) return 'saved';
    const outcome = await scanStudentQr(item.qrToken, item.location ?? undefined);
    if (outcome.result) {
      if (outcome.result.action === 'unknown') return 'refused';
      checkedIn.add(item.qrToken.toLowerCase()); // the same code scanned twice while waiting: the second is not sent
      return 'saved';
    }
    return outcome.errorKey === NETWORK ? 'offline' : 'refused';
  }
  const outcome = await markVisit(item.studentId, item.action, item.location ?? undefined);
  if (outcome.result) return outcome.result.action === 'unknown' ? 'refused' : 'saved';
  return outcome.errorKey === NETWORK ? 'offline' : 'refused';
}

let sending: Promise<void> | null = null;

/**
 * Sends this login's waiting saves, oldest first; stops at the first "no connection". Saves too old to be saved leave
 * the list unsent, and they and the refused ones are counted for the screens' notice (addToReport).
 * @param now and @param today for the tests; the device's time and the class's date otherwise.
 */
export function sendQueued(profileId: string, now: number = Date.now(), today: string = todayLocal()): Promise<void> {
  // .finally, not try/finally inside: with nothing to send the round ends before `sending` is even set.
  sending ??= sendRound(profileId, now, today).finally(() => {
    sending = null;
  });
  return sending;
}

async function sendRound(profileId: string, now: number, today: string): Promise<void> {
  const mine = queuedSaves().filter((item) => item.profileId === profileId);
  const tooOld = mine.filter((item) => !sendable(item, now, today)).map((item) => item.id);
  removeSaves(tooOld);
  addToReport({ refused: 0, tooOld: tooOld.length });
  // Who is in today is read once per round, and only when a scanned code waits.
  let tokens: Promise<Set<string> | null> | null = null;
  const inToday = () => (tokens ??= checkedInTokens());
  for (const item of mine) {
    const ready = sendable(item, now, today);
    if (!ready) continue;
    const outcome = await sendOne(ready, inToday);
    if (outcome === 'offline') return;
    removeSaves([item.id]);
    if (outcome === 'refused') addToReport({ refused: 1, tooOld: 0 });
  }
}

/** True while this login has something waiting. */
function waits(profileId: string): boolean {
  return queuedSaves().some((item) => item.profileId === profileId);
}

/**
 * Sends the signed-in login's waiting saves when the connection may be back (see the top of this file). Does nothing
 * without a login. Renders nothing; used once, in the root layout.
 */
export function useQueueSender(profileId: string | undefined): void {
  useEffect(() => {
    if (!profileId) return;
    const send = () => {
      if (waits(profileId)) void sendQueued(profileId);
    };
    send();
    const timer = setInterval(send, RETRY_MS);
    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active') send();
    });
    const online = Platform.OS === 'web' && typeof window !== 'undefined' ? window : null;
    // A save just queued waits for the next try: it has just failed.
    online?.addEventListener('online', send);
    return () => {
      clearInterval(timer);
      appState.remove();
      online?.removeEventListener('online', send);
    };
  }, [profileId]);
}
