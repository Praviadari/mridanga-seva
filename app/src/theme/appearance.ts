// The light / dark choice of My profile (docs/DECISIONS.md #361), remembered on this device (lib/local-storage.ts) and
// read by useTheme (theme/use-theme.ts), so every screen follows it at once. On Android and iOS it is also handed to
// the phone (Appearance.setColorScheme), so the parts the system draws (date pickers, alerts) follow too; the web has
// no such switch and follows useTheme alone. "Same as phone" removes the saved value.

import { useSyncExternalStore } from 'react';
import { Appearance, Platform } from 'react-native';

import { appearanceFrom, type AppearanceChoice } from '@/lib/appearance';
import { readLocal, removeLocal, writeLocal } from '@/lib/local-storage';

const KEY = 'appearance';

let current: AppearanceChoice = appearanceFrom(readLocal(KEY));
const listeners = new Set<() => void>();

/** Tells the phone (not the web) which scheme to draw its own parts in. */
function tellPhone(choice: AppearanceChoice) {
  if (Platform.OS === 'web' || typeof Appearance.setColorScheme !== 'function') return;
  Appearance.setColorScheme(choice === 'system' ? 'unspecified' : choice);
}

// A choice saved earlier applies from the first screen.
if (current !== 'system') tellPhone(current);

/** Changes the choice, remembers it on this device and redraws every screen. */
export function setAppearance(choice: AppearanceChoice) {
  current = choice;
  if (choice === 'system') removeLocal(KEY);
  else writeLocal(KEY, choice);
  tellPhone(choice);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const read = () => current;

/** The current choice; re-renders the caller when it changes. */
export function useAppearance(): AppearanceChoice {
  return useSyncExternalStore(subscribe, read, read);
}
