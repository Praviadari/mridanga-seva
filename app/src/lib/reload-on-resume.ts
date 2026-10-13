// A screen that stays open while the phone sleeps loads again when the app comes back after a while (audit
// phase 2 F9: R4-04; docs/DECISIONS.md #327). The screens load on focus only, and a tab that stays focused is
// never focused again: a door phone unlocked the next class day showed yesterday's "here now".

import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { AppState } from 'react-native';

import { shouldReload } from './resume-rule';

/** Calls `load` when the app comes back to the front after five minutes or more (lib/resume-rule.ts), while this screen is focused. */
export function useReloadOnResume(load: () => unknown): void {
  useFocusEffect(
    useCallback(() => {
      let awaySince: number | null = null;
      const subscription = AppState.addEventListener('change', (state) => {
        if (state === 'active') {
          if (shouldReload(awaySince, Date.now())) void load();
          awaySince = null;
        } else if (awaySince === null) {
          awaySince = Date.now();
        }
      });
      return () => subscription.remove();
    }, [load]),
  );
}
