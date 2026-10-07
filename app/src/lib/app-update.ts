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

import { formatDateTime } from './dates';

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

/** How long Restart waits for the app to reload before it says it could not: 10 seconds. */
const RESTART_WAIT_MS = 10 * 1000;

/** What a home screen needs to offer a downloaded update. */
export type AppUpdate = {
  /** True when a newer version is downloaded and restart() would start it. */
  ready: boolean;
  /**
   * Restarts the app into the downloaded version; any unsaved input on the screen is lost. When
   * the restart works, this JavaScript stops running and the promise never settles. Otherwise it
   * resolves with a short technical reason (not translated) for a tester to report.
   */
  restart: () => Promise<string>;
};

/** A promise that rejects with "no answer after 10 s" after RESTART_WAIT_MS. */
function noAnswer(): Promise<never> {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('no answer after 10 s')), RESTART_WAIT_MS));
}

/**
 * The error's code and message, plus the last error expo-updates logged on the phone in the last
 * minute, which usually names the real cause. At most 300 characters.
 */
async function describeFailure(error: unknown): Promise<string> {
  const { code, message } = (error ?? {}) as { code?: string; message?: string };
  let reason = [code, message].filter(Boolean).join(': ') || String(error);
  try {
    const entries = await Updates.readLogEntriesAsync(60 * 1000);
    const lastError = entries.filter((e) => e.level === 'error' || e.level === 'fatal').at(-1);
    if (lastError) reason += ` | log ${lastError.code}: ${lastError.message}`;
  } catch {
    // No log to add.
  }
  return reason.slice(0, 300);
}

/**
 * Asks expo-updates to reload into the downloaded update. Seen 01-10-2026 on the first test: the
 * tap did nothing and the error was lost, so every way it can fail now returns a reason: an
 * error, no answer, or an answer without the reload that should follow it.
 */
async function restartIntoUpdate(): Promise<string> {
  try {
    await Promise.race([Updates.reloadAsync(), noAnswer()]);
    // reloadAsync resolves just before the reload starts; still being here later means it did not.
    await new Promise((resolve) => setTimeout(resolve, RESTART_WAIT_MS));
    return 'reloadAsync resolved but the app did not reload';
  } catch (error) {
    return describeFailure(error);
  }
}

/** Whether a downloaded update is waiting, and how to start it. */
export function useAppUpdate(): AppUpdate {
  const { isUpdatePending } = Updates.useUpdates();
  return {
    ready: canUpdate && isUpdatePending,
    restart: restartIntoUpdate,
  };
}

/** Which version this phone runs, for the line under the home screens. */
export type RunningVersion =
  /** The JavaScript that came inside the APK. `date`: when it was built, in the class's date style and time zone (formatDateTime). */
  | { kind: 'installed'; version: string; date: string }
  /** An update downloaded later. `id`: the first 8 characters of its EAS update id. */
  | { kind: 'update'; version: string; date: string; id: string }
  /** The web version (app-update.web.ts): which site (test or live), the commit and when it was exported. */
  | { kind: 'web'; site: string; commit: string; date: string };

/**
 * The version running now: the app version from app.json and the date of the running bundle.
 * Null in development and wherever updates are off, where there is nothing useful to show.
 */
export function runningVersion(): RunningVersion | null {
  if (!canUpdate || !Updates.createdAt) return null;
  const version = Constants.expoConfig?.version ?? '?';
  const date = formatDateTime(Updates.createdAt.toISOString());
  if (Updates.isEmbeddedLaunch || !Updates.updateId) return { kind: 'installed', version, date };
  return { kind: 'update', version, date, id: Updates.updateId.slice(0, 8) };
}
