// Shown instead of a blank page when a screen crashes (D10-17, docs/DECISIONS.md #216): the root
// layout exports it as Expo Router's ErrorBoundary (src/app/_layout.tsx). It says what happened in
// the person's language, offers Try again and the way home, and shows the version and the error's
// first line so a tester can report it. Nothing is sent anywhere: the class has no crash reporter
// (a reporter would need a privacy review first, minors use the app).
//
// It replaces the whole app, providers included, so it uses nothing that needs them: translations
// are set up at start (src/i18n), the theme follows the phone, the router works without a screen.

import type { ErrorBoundaryProps } from 'expo-router';
import { router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AppText } from './app-text';
import { Button } from './button';
import { Notice } from './notice';
import { Screen } from './screen';
import { VersionLine } from './update-notice';

/** Longest error line shown: enough to recognise the error, short enough for a screenshot. */
const DETAIL_MAX = 200;

/** The error's first line for the report, e.g. "TypeError: x is undefined". Not translated. */
export function errorDetail(error: unknown): string {
  const named = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return named.split('\n')[0].slice(0, DETAIL_MAX);
}

/** "Something went wrong" with Try again and Go to the home screen. */
export function CrashScreen({ error, retry }: ErrorBoundaryProps) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  // A crash before the first screen would otherwise leave the splash up for good.
  useEffect(() => {
    SplashScreen.hide();
  }, []);

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
      <Button icon="refresh" label={t('crash.tryAgain')} loading={busy} onPress={() => void again(false)} />
      <Button variant="secondary" icon="home" label={t('crash.home')} disabled={busy} onPress={() => void again(true)} />
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
