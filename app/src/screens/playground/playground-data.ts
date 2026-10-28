// What the student's Playground screens read and send (docs/RHYTHM_PLAYGROUND.md §8.6 rule 6, §9.3; docs/DECISIONS.md
// #736), on the engine's data module (data/playground.ts, package W1): the published pack (the copy on the phone
// first, refreshed when the content version changed), the student's state (level, ticks, settings, assignments, saved
// rounds) and the rounds kept on this phone, merged, so the repeat guard, review and labels work offline. A finished
// round goes into the phone's queue first and is sent when online; a lost answer never saves it twice.

import { fetchPlayPack, fetchPlayState, sendPlayedRound } from '@/data/playground';
import { cachedPack, cachedPackVersion, savePack } from '@/lib/playground/pack-cache';
import { enqueueRound, mergeRounds, recentRounds, rememberRounds, syncRounds } from '@/lib/playground/round-queue';
import type { PlayedRound, PlayPack, StudentPlayState } from '@/lib/playground/types';

/** What a Playground screen starts from. `pack` or `state` null: the Playground is not on for this student yet. */
export type PlaygroundLoad = {
  pack: PlayPack | null;
  state: StudentPlayState | null;
  /** This student's rounds of the last 30 days: the saved ones and those on this phone. */
  rounds: PlayedRound[];
  /** The server could not be reached: playing from the phone's copy. */
  offline: boolean;
  /** When this was read (ms): the "now" of the step advice and the labels, so a render stays pure. */
  at: number;
};

/** Loads the pack, the state and the rounds; sends any rounds waiting in the queue. */
export async function loadPlayground(profileId: string): Promise<PlaygroundLoad> {
  let pack = cachedPack();
  let offline = false;
  const fresh = await fetchPlayPack(cachedPackVersion());
  if (fresh === null) offline = true;
  else if (fresh !== 'unchanged') {
    savePack(fresh);
    pack = fresh;
  }
  const state = await fetchPlayState();
  if (state === null) offline = true;
  else rememberRounds(profileId, state.rounds);
  if (!offline && profileId) void syncRounds(profileId, sendPlayedRound);
  return {
    pack,
    state,
    rounds: mergeRounds(state?.rounds ?? [], recentRounds(profileId)),
    offline,
    at: Date.now(),
  };
}

/** Keeps a finished (or left) round on the phone and sends it when it can; the student's rounds after it. */
export async function saveRound(profileId: string, round: PlayedRound): Promise<PlayedRound[]> {
  if (!profileId) return [round];
  enqueueRound(profileId, round);
  rememberRounds(profileId, [round]);
  await syncRounds(profileId, sendPlayedRound).catch(() => undefined);
  return recentRounds(profileId);
}
