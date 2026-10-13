// Whether push notifications work on this phone, for a quiet notice (audit R5-04, docs/DECISIONS.md #305).
// src/lib/push.ts sets it after each try to register; components/push-notice.tsx shows it on the homes and
// My profile. Before #305 a refused permission or a failed registration was silent, and the phone missed every
// announcement push with nothing on screen to say so. Kept apart from push.ts, which loads native modules, so
// the rules can be tested in plain Node. The web version never sets it (no push there yet), so it stays
// 'unknown' and nothing is shown.

import { useSyncExternalStore } from 'react';

import { readLocal, writeLocal } from './local-storage';

/**
 * 'unknown' = not tried yet (or the web); 'on' = the token is saved; 'off' = push cannot work on this build
 * (Expo Go, not set up), nothing to tell; 'denied' = the person said no to notifications; 'failed' = the token
 * could not be got or saved (no internet, a server refusal). The app tries again when it comes back to the front.
 */
export type PushState = 'unknown' | 'on' | 'off' | 'denied' | 'failed';

let state: PushState = 'unknown';
const listeners = new Set<() => void>();

/** Sets the state after a try to register (src/lib/push.ts). */
export function setPushState(next: PushState): void {
  if (next === state) return;
  state = next;
  for (const listener of listeners) listener();
}

/** The state now. */
export function pushState(): PushState {
  return state;
}

/** True when coming back to the front should try to register again: it was refused or it failed. */
export function pushNeedsRetry(current: PushState = state): boolean {
  return current === 'denied' || current === 'failed';
}

/** Device storage key: "1" once the person tapped Not now on the home's notice about refused notifications. */
const DENIED_DISMISSED_KEY = 'pushDeniedNoticeHidden';

/** Hides the home's notice about refused notifications on this phone; My profile still shows it. */
export function hideDeniedNoticeOnHome(): void {
  writeLocal(DENIED_DISMISSED_KEY, '1');
  for (const listener of listeners) listener();
}

/**
 * Which notice a place shows, or null for none. 'failed' shows everywhere (the app retries by itself);
 * 'denied' shows on My profile always, and on a home until the person taps Not now there.
 * @param current the push state.
 * @param place where the notice would stand.
 * @param hiddenOnHome whether Not now was tapped on this phone.
 */
export function pushNoticeFor(current: PushState, place: 'home' | 'profile', hiddenOnHome: boolean): 'denied' | 'failed' | null {
  if (current === 'failed') return 'failed';
  if (current === 'denied') return place === 'home' && hiddenOnHome ? null : 'denied';
  return null;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The notice for `place`, kept current while the screen is open. */
export function usePushNotice(place: 'home' | 'profile'): 'denied' | 'failed' | null {
  const current = useSyncExternalStore(subscribe, pushState, pushState);
  const hidden = useSyncExternalStore(subscribe, () => readLocal(DENIED_DISMISSED_KEY) === '1', () => false);
  return pushNoticeFor(current, place, hidden);
}
