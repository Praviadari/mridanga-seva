// Push notifications in the web version: none yet. Metro uses this file instead of ./push.ts on
// the web, because expo-notifications does not work in a browser. iPhone web push (service
// worker, iOS 16.4+ home-screen app) is planned after the demo (docs/DECISIONS.md #33).

import type { Area } from '@/auth/types';

/** Does nothing on the web. */
export async function registerForPush(): Promise<void> {}

/** Does nothing on the web. */
export async function unregisterPush(): Promise<void> {}

/** Does nothing on the web. */
export async function dismissNotifications(): Promise<void> {}

/** Does nothing on the web. `area` is taken only to match ./push.ts. */
export function usePushTaps(area: Area): void {
  void area;
}
