// The signed-in person's profile row (name, role, language, active), remembered on this device,
// so the app can open their home at once on the next start instead of waiting for the login to
// be refreshed and the profile fetched (2-5 s, longer on a weak signal), and still opens it with
// no internet at all, e.g. for My QR at the door (docs/DECISIONS.md #37). Written after every
// successful profile fetch, forgotten on sign-out. The database still checks every read and
// write, so an old copy can show a screen but never data the person may no longer see.

import { readLocal, removeLocal, writeLocal } from '@/lib/local-storage';

import type { Profile } from './types';

const KEY = 'savedProfile';

/** The remembered profile, or null when there is none or it cannot be read. */
export function readSavedProfile(): Profile | null {
  const text = readLocal(KEY);
  if (!text) return null;
  try {
    const value = JSON.parse(text) as Partial<Profile>;
    // Only a complete row counts; anything else is treated as no copy at all.
    if (
      typeof value.id !== 'string' ||
      typeof value.role !== 'string' ||
      typeof value.active !== 'boolean' ||
      typeof value.full_name !== 'string'
    ) {
      return null;
    }
    return value as Profile;
  } catch {
    return null;
  }
}

/** Remembers `profile` as the signed-in person's profile on this device. */
export function saveProfile(profile: Profile): void {
  writeLocal(KEY, JSON.stringify(profile));
}

/** Forgets the remembered profile, e.g. on sign-out. */
export function forgetSavedProfile(): void {
  removeLocal(KEY);
}
