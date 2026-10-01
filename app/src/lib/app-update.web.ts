// Over-the-air updates in the web version: none needed. Metro uses this file instead of
// ./app-update.ts on the web, because expo-updates does not run in a browser. A new web version
// is a new upload to the web host (docs/OPERATIONS.md "Publishing the web version"); people get
// it the next time the page loads.

import type { AppUpdate, RunningVersion } from './app-update';

/** Does nothing on the web. */
export function useUpdateChecks(): void {}

/** Never ready on the web. */
export function useAppUpdate(): AppUpdate {
  return { ready: false, restart: async () => 'no updates on the web' };
}

/** Nothing to show on the web. */
export function runningVersion(): RunningVersion | null {
  return null;
}
