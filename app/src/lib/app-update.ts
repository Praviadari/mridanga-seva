// Over-the-air updates for the Android app (docs/DECISIONS.md #35). The web version uses
// ./app-update.web.ts: a new web version arrives when the page is loaded again.
//
// expo-updates checks for an update each time the app starts (app.json
// updates.checkAutomatically "ON_LOAD") and downloads it in the background; on its own it would
// show the new version only on the start after that. Phones keep the app open for days, so the
// root layout also checks each time the app comes back to the front (useUpdateChecks), and the
// home screens offer a Restart once an update is downloaded (useAppUpdate,
// components/update-notice.tsx). Everything gives up quietly: in development, in Expo Go and
// offline nothing happens and the app runs the version it has.

import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { formatDateTimeInIndia } from './dates';

/** Least time between two checks when the app comes back to the front: 30 minutes. */
const CHECK_EVERY_MS = 30 * 60 * 1000;

/** True when updates can work here: a release build with expo-updates switched on. */
const canUpdate = Updates.isEnabled && !__DEV__;

/** When the last check started. The check expo-updates makes at start-up counts as one. */
let lastCheck = Date.now();

/** Looks for a newer update and downloads it; useUpdates() then reports it as pending. Never throws. */
async function checkAndDownload(): Promise<void> {
  if (!canUpdate || Date.now() - lastCheck < CHECK_EVERY_MS) return;
  lastCheck = Date.now();
  try {
    const result = await Updates.checkForUpdateAsync();
    if (result.isAvailable) await Updates.fetchUpdateAsync();
  } catch {
    // Offline, or Expo's server did not answer: the next return to the front tries again.
  }
}

/**
 * Checks for an update each time the app comes back to the front, at most every 30 minutes.
 * Used once, by the root layout.
 */
export function useUpdateChecks(): void {
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void checkAndDownload();
    });
    return () => subscription.remove();
  }, []);
}

/** What a home screen needs to offer a downloaded update. */
export type AppUpdate = {
  /** True when a newer version is downloaded and restart() would start it. */
  ready: boolean;
  /** Restarts the app into the downloaded version. Any unsaved input on the screen is lost. */
  restart: () => void;
};

/** Whether a downloaded update is waiting, and how to start it. */
export function useAppUpdate(): AppUpdate {
  const { isUpdatePending } = Updates.useUpdates();
  return {
    ready: canUpdate && isUpdatePending,
    restart: () => void Updates.reloadAsync().catch(() => {}),
  };
}

/** Which version this phone runs, for the line under the home screens. */
export type RunningVersion =
  /** The JavaScript that came inside the APK. `date`: when it was built, "DD-MM-YYYY HH:MM" in IST. */
  | { kind: 'installed'; version: string; date: string }
  /** An update downloaded later. `id`: the first 8 characters of its EAS update id. */
  | { kind: 'update'; version: string; date: string; id: string };

/**
 * The version running now: the app version from app.json and the date of the running bundle.
 * Null in development and wherever updates are off, where there is nothing useful to show.
 */
export function runningVersion(): RunningVersion | null {
  if (!canUpdate || !Updates.createdAt) return null;
  const version = Constants.expoConfig?.version ?? '?';
  const date = formatDateTimeInIndia(Updates.createdAt.toISOString());
  if (Updates.isEmbeddedLaunch || !Updates.updateId) return { kind: 'installed', version, date };
  return { kind: 'update', version, date, id: Updates.updateId.slice(0, 8) };
}
