// Over-the-air updates in the web version: none needed. Metro uses this file instead of
// ./app-update.ts on the web, because expo-updates does not run in a browser. A new web version
// is a new upload to the web host (docs/OPERATIONS.md "Publishing the web version"); people get
// it the next time the page loads.

import type { AppUpdate, RunningVersion } from './app-update';
import { formatDateTime } from './dates';

/** Does nothing on the web. */
export function useUpdateChecks(): void {}

/** Never ready on the web. */
export function useAppUpdate(): AppUpdate {
  return { ready: false, restart: async () => 'no updates on the web' };
}

/**
 * Which upload this page came from: scripts/export-web.mjs sets EXPO_PUBLIC_BUILD to
 * "<site> <commit> <ISO time>" (docs/DECISIONS.md #144), and OPERATIONS.md logs each upload with
 * the same values, so anyone can tell which commit a site serves. Null in development.
 */
export function runningVersion(): RunningVersion | null {
  const [site, commit, built] = (process.env.EXPO_PUBLIC_BUILD ?? '').split(' ');
  if (!site || !commit || !built) return null;
  return { kind: 'web', site, commit, date: formatDateTime(built) };
}
