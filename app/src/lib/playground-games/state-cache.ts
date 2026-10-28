// The student's last Playground state on this phone (docs/DECISIONS.md #736): level, ticked items, settings and
// assignments, without the rounds (those are in lib/playground/round-queue.ts's history). With the cached pack it lets
// the games open offline. For the person signed in only; wiped at sign-out with the other traces
// (lib/device-traces.ts).

import { readLocal, removeLocal, writeLocal } from '../local-storage';
import type { StudentPlayState } from '../playground/types';

const KEY = 'playgroundState';

type Stored = { profileId: string; state: Omit<StudentPlayState, 'rounds'> };

/** Keeps the state (its rounds left out). */
export function keepPlayState(profileId: string, state: StudentPlayState): void {
  const { rounds: _rounds, ...rest } = state;
  writeLocal(KEY, JSON.stringify({ profileId, state: rest } satisfies Stored));
}

/** The state kept for this login, with no rounds; null when there is none or it is another login's. */
export function keptPlayState(profileId: string): StudentPlayState | null {
  try {
    const stored = JSON.parse(readLocal(KEY) ?? 'null') as Stored | null;
    if (!stored || stored.profileId !== profileId || typeof stored.state?.levelId !== 'number') return null;
    return { ...stored.state, rounds: [] };
  } catch {
    return null;
  }
}

/** Sign-out: forget it. */
export function forgetPlayState(): void {
  removeLocal(KEY);
}
