// The Playground pack kept on this device (docs/RHYTHM_PLAYGROUND.md §9.3; #728): the published content
// (dictionary, sound list, templates, exercises, label numbers) as last downloaded, so the games work offline.
// It is class content, no personal data; a new version replaces it when the server has one (playground_pack
// answers null while the version is unchanged). Recordings are cached by the audio layer, not here.

import { readLocal, removeLocal, writeLocal } from '@/lib/local-storage';

import type { PlayPack } from './types';

const KEY = 'playgroundPack';

let cached: { raw: string | null; value: PlayPack | null } = { raw: null, value: null };

/** The pack on this device, or null (never downloaded, or unreadable). */
export function cachedPack(): PlayPack | null {
  const raw = readLocal(KEY);
  if (raw === cached.raw) return cached.value;
  let value: PlayPack | null = null;
  try {
    const parsed = JSON.parse(raw ?? 'null') as PlayPack | null;
    if (parsed && typeof parsed.version === 'number' && Array.isArray(parsed.exercises) && Array.isArray(parsed.bols)) value = parsed;
  } catch {
    value = null;
  }
  cached = { raw, value };
  return value;
}

/** The version on this device; 0 = none (the server then sends the whole pack). */
export function cachedPackVersion(): number {
  return cachedPack()?.version ?? 0;
}

/** Keeps a downloaded pack (replacing the older one). */
export function savePack(pack: PlayPack): void {
  writeLocal(KEY, JSON.stringify(pack));
}

/** Removes the pack (sign-out of a TEST login, or a broken copy). */
export function forgetPack(): void {
  removeLocal(KEY);
}
