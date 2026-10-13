// Which crashes go to expo-updates' own error recovery instead of the crash screen (audit R4-03,
// docs/DECISIONS.md #294). Pure rule, unit-tested (tests/weekend-app.test.mjs); src/lib/app-update.ts acts on it.
//
// expo-updates rolls a bad update back, or fetches a fix, only for a FATAL JavaScript error thrown soon after
// the app starts (https://docs.expo.dev/eas-update/error-recovery/: before the first screen's content showed,
// the update is marked failed and the app goes back to the last update that worked; after it, it looks for a
// newer update for 5 s and then crashes; nothing is caught more than 10 s after the first render). The crash
// screen (src/components/crash-screen.tsx) is a React error boundary: it catches the error, so on its own
// expo-updates never sees it and a bad update traps everyone on "Something went wrong".
//
// So a crash in the first seconds while the app runs a downloaded update is handed on as a fatal error, once
// per update: if the same update crashes at start again (a bad record, not bad code), the crash screen shows,
// with Restart, instead of the app closing on every start. The JavaScript inside the APK has nothing to go back
// to, so its crashes always show the crash screen, which looks for a fix itself.

/** Errors this soon after the JavaScript started are start-up errors: inside expo-updates' 10 s after the first render. */
export const STARTUP_WINDOW_MS = 8_000;

/** Device key: the update id whose start-up crash was last handed to expo-updates. */
export const HANDED_OVER_KEY = 'mridanga.crashHandedOver';

/** What the rule looks at. */
export type CrashContext = {
  /** A release build with expo-updates on (false on the web and in development). */
  updatesOn: boolean;
  /** True when the JavaScript inside the APK runs, not a downloaded update. */
  embeddedLaunch: boolean;
  /** The running update's id; null for the APK's own JavaScript. */
  updateId: string | null;
  /** Milliseconds since this JavaScript started. */
  msSinceStart: number;
  /** HANDED_OVER_KEY's value on this phone. */
  handedOverFor: string | null;
};

/** True when this crash should go to expo-updates as a fatal error instead of the crash screen. */
export function handOverToUpdates(crash: CrashContext): boolean {
  return (
    crash.updatesOn &&
    !crash.embeddedLaunch &&
    !!crash.updateId &&
    crash.msSinceStart >= 0 &&
    crash.msSinceStart < STARTUP_WINDOW_MS &&
    crash.handedOverFor !== crash.updateId
  );
}
