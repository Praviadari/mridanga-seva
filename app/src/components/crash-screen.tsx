// Shown instead of a blank page when a screen crashes (D10-17, docs/DECISIONS.md #216): the root
// layout exports it as Expo Router's ErrorBoundary (src/app/_layout.tsx). It says what happened in
// the person's language, offers Try again and the way home, and shows the version and the error's
// first line so a tester can report it. Since 0061 (#585) the class's error log gets the error's NAME, the screen's
// route pattern and the version, never the message or anything about the person (src/lib/error-report.ts): minors
// use the app, so nothing more is sent.
//
// It replaces the whole app, providers included, so it uses nothing that needs them: translations
// are set up at start (src/i18n), the theme follows the phone, the router works without a screen.
//
// A bad update must not trap people here (audit R4-03, docs/DECISIONS.md #294): a crash in the first seconds
// of a downloaded update goes on to expo-updates' own recovery (src/lib/crash-recovery.ts), which goes back to
// the last update that worked; for every other crash this screen looks for a newer update at once, offers it
// (UpdateNotice: "Restart now") and always offers "Restart the app" (on the web: the page loads again).

import type { ErrorBoundaryProps } from 'expo-router';
import { router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { checkForUpdateNow, handOverStartupCrash, startupCrashGoesToUpdates } from '@/lib/app-update';
import { reportError } from '@/lib/error-report';
import { restartApp } from '@/lib/slow-start';

import { AppText } from './app-text';
import { Button } from './button';
import { Notice } from './notice';
import { Screen } from './screen';
import { UpdateNotice, VersionLine } from './update-notice';

/** Longest error line shown: enough to recognise the error, short enough for a screenshot. */
const DETAIL_MAX = 200;

/** The error's first line for the report, e.g. "TypeError: x is undefined". Not translated. */
export function errorDetail(error: unknown): string {
  const named = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return named.split('\n')[0].slice(0, DETAIL_MAX);
}

/** "Something went wrong" with Try again, Go to the home screen and Restart the app. */
export function CrashScreen({ error, retry }: ErrorBoundaryProps) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [restarting, setRestarting] = useState(false);
  // Decided once, when the crash is first shown: a start-up crash of a downloaded update goes to expo-updates.
  const [handingOver, setHandingOver] = useState(startupCrashGoesToUpdates);
  useEffect(() => {
    if (handingOver) {
      // After this render, not during it. If it could not be handed on, this screen shows after all.
      void Promise.resolve().then(() => {
        if (!handOverStartupCrash(error)) setHandingOver(false);
      });
      return;
    }
    // A crash before the first screen would otherwise leave the splash up for good.
    SplashScreen.hide();
    // The class's error log: the error's name, the screen's pattern and the version, nothing personal (0061, #585).
    reportError('crash', error);
    // A fix may be out already: download it now, so UpdateNotice offers it (no 30-minute wait).
    void checkForUpdateNow();
  }, [handingOver, error]);

  // expo-updates takes over (it restarts or closes the app): nothing is drawn meanwhile.
  if (handingOver) return null;

  async function restart() {
    setRestarting(true);
    // Settles only when the restart did not happen (development, or no answer).
    await restartApp();
    setRestarting(false);
  }

  async function again(home: boolean) {
    setBusy(true);
    // The home screen first: the screen that crashed would most likely crash again.
    if (home) router.replace('/');
    await retry();
    setBusy(false);
  }

  return (
    <Screen centred>
      <AppText variant="title">{t('crash.title')}</AppText>
      <Notice tone="error">{t('crash.body')}</Notice>
      {/* A downloaded fix: "A new version is ready" with Restart now. */}
      <UpdateNotice />
      <Button icon="refresh" label={t('crash.tryAgain')} loading={busy} disabled={restarting} onPress={() => void again(false)} />
      <Button variant="secondary" icon="home" label={t('crash.home')} disabled={busy || restarting} onPress={() => void again(true)} />
      <Button variant="secondary" label={t('crash.restart')} loading={restarting} disabled={busy} onPress={() => void restart()} />
      <AppText variant="small" tone="muted">
        {t('crash.report')}
      </AppText>
      {/* Technical detail for the maintainer, so not translated. */}
      <AppText variant="small" tone="muted" selectable>
        {errorDetail(error)}
      </AppText>
      <VersionLine />
    </Screen>
  );
}
