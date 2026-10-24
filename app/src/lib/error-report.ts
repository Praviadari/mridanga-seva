// The app tells the class's error log when something breaks (migration 0061, docs/DECISIONS.md #585): a screen
// that crashed (the crash screen, src/components/crash-screen.tsx) and an error nobody caught (an unhandled promise
// rejection, a global error). What goes is chosen so that no person can be read from it: the kind, the error's
// NAME only (TypeError, never its message, which can hold data), the screen's route PATTERN (/staff/students/[id],
// never the address with its ids), the app version and the platform. Signed-out errors are not sent (the function
// is for signed-in people); each error goes once per run, at most 20 a run; the database has its own limits.
// The pure rules are in ./error-report-rules.ts.

import { Platform } from 'react-native';

import { sendErrorReport, type ErrorReport } from '@/data/app-errors';

import { runningVersion } from './app-update';
import { errorName, platformOf, RUN_LIMIT, screenPattern, versionTag } from './error-report-rules';

let screen = '/';
let signedIn = false;
let sent = 0;
const seen = new Set<string>();

/** The root layout says where the person is and whether someone is signed in (src/app/_layout.tsx). */
export function noteScreen(segments: readonly string[], isSignedIn: boolean): void {
  screen = screenPattern(segments);
  signedIn = isSignedIn;
}

/** Sends one report about `error`, once per run for the same error on the same screen. Never throws. */
export function reportError(kind: ErrorReport['kind'], error: unknown): void {
  try {
    const platform = platformOf(Platform.OS);
    if (!signedIn || !platform || sent >= RUN_LIMIT) return;
    const report: ErrorReport = { kind, errorName: errorName(error), screen, version: versionTag(runningVersion()), platform };
    const key = `${report.kind} ${report.errorName} ${report.screen}`;
    if (seen.has(key)) return;
    seen.add(key);
    sent += 1;
    void sendErrorReport(report);
  } catch {
    // Reporting must never break the app.
  }
}

type GlobalHandler = (error: unknown, isFatal?: boolean) => void;
type ErrorUtilsShape = { getGlobalHandler(): GlobalHandler; setGlobalHandler(handler: GlobalHandler): void };
type HermesShape = { enablePromiseRejectionTracker?: (options: { allRejections: boolean; onUnhandled: (id: number, error: unknown) => void }) => void };

let installed = false;

/**
 * Listens for errors nobody caught, once. Web: the page's error and unhandledrejection events. Phones: React
 * Native's global error handler (the old one still runs after) and, in a release build, Hermes's tracker of
 * unhandled promise rejections (development has its own red box).
 */
export function installErrorReporting(): void {
  if (installed) return;
  installed = true;
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') return;
    window.addEventListener('error', (event) => reportError('unhandled', event.error ?? event));
    window.addEventListener('unhandledrejection', (event) => reportError('unhandled', event.reason));
    return;
  }
  const g = globalThis as { ErrorUtils?: ErrorUtilsShape; HermesInternal?: HermesShape; __DEV__?: boolean };
  const utils = g.ErrorUtils;
  if (utils) {
    const previous = utils.getGlobalHandler();
    utils.setGlobalHandler((error, isFatal) => {
      reportError(isFatal ? 'crash' : 'unhandled', error);
      previous(error, isFatal);
    });
  }
  if (!g.__DEV__) {
    g.HermesInternal?.enablePromiseRejectionTracker?.({ allRejections: true, onUnhandled: (_id, error) => reportError('unhandled', error) });
  }
}
