// "Taking long, try again" for the start of the app (D6-02, FS3-04; docs/DECISIONS.md #237). While the login
// and profile are checked the splash shows; when that takes longer than SLOW_START_MS the native splash is
// hidden (src/app/_layout.tsx) and the app's own splash says so, with Try again (src/components/brand.tsx).

import * as Updates from 'expo-updates';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

/**
 * How long the start may take before the splash says so, in milliseconds. Shorter than a call's time limit
 * (src/lib/timed-fetch.ts), so the person hears something before the calls give up.
 */
export const SLOW_START_MS = 10_000;

/**
 * True once `waiting` has stayed true for `ms`; false again as soon as it is false.
 * @param waiting whether the app is still starting.
 * @param ms how long counts as slow.
 */
export function useTakingLong(waiting: boolean, ms: number = SLOW_START_MS): boolean {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!waiting) return;
    const timer = setTimeout(() => setSlow(true), ms);
    return () => {
      clearTimeout(timer);
      setSlow(false);
    };
  }, [waiting, ms]);
  return waiting && slow;
}

/**
 * Starts the app again from the beginning: the page is loaded again on the web, the JavaScript is reloaded on
 * the phone. A stalled start then gets new connections.
 */
export async function restartApp(): Promise<void> {
  if (Platform.OS === 'web') {
    window.location.reload();
    return;
  }
  await Updates.reloadAsync().catch(() => undefined);
}
