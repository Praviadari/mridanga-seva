// What the student's Playground screens read and send (docs/RHYTHM_PLAYGROUND.md §8.6 rule 6, §9.3; docs/DECISIONS.md
// #736), on the engine's data module (data/playground.ts, #728): the published pack (the copy on the phone when the
// server cannot be reached), the student's state (the last one kept on the phone when offline) and the rounds of the
// last 30 days, saved and on the phone, merged, so the repeat guard, review and labels work offline. A finished round
// goes into the phone's queue first and is sent when online; a lost answer never saves it twice.

import { fetchMyPlayState, loadPlaygroundPack, saveRound as queueRound, syncPlayground } from '@/data/playground';
import { keepPlayState, keptPlayState } from '@/lib/playground-games/state-cache';
import { mergeRounds, recentRounds } from '@/lib/playground/round-queue';
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
  const packLoad = await loadPlaygroundPack().catch(() => ({ pack: null, fromCache: true, errorKey: null }));
  const fetched = profileId ? await fetchMyPlayState(profileId).catch(() => ({ state: null, errorKey: null })) : { state: null, errorKey: null };
  let state = fetched.state;
  if (state) keepPlayState(profileId, state);
  else state = keptPlayState(profileId);
  const offline = packLoad.fromCache || !fetched.state;
  if (fetched.state) void syncPlayground(profileId).catch(() => undefined);
  return {
    pack: packLoad.pack,
    state,
    rounds: mergeRounds(fetched.state?.rounds ?? [], recentRounds(profileId)),
    offline: offline && Boolean(packLoad.pack && state),
    at: Date.now(),
  };
}

/** Keeps a finished (or left) round on the phone and sends it when it can; the student's rounds after it. */
export async function saveRound(profileId: string, round: PlayedRound): Promise<PlayedRound[]> {
  if (!profileId) return [round];
  await queueRound(profileId, round).catch(() => undefined);
  return recentRounds(profileId);
}
