// "A new version is ready" with a Restart button, and the small version line, for the three home
// screens (S1, C1, G1). Android app only: on the web both render nothing (src/lib/app-update.web.ts).

import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

import { runningVersion, useAppUpdate } from '@/lib/app-update';

import { AppText } from './app-text';
import { Button } from './button';
import { Notice } from './notice';

/** Shows a notice and a Restart button once a newer version is downloaded; otherwise nothing. */
export function UpdateNotice() {
  const { t } = useTranslation();
  const update = useAppUpdate();
  if (!update.ready) return null;
  return (
    <>
      <Notice tone="success" title={t('appUpdate.readyTitle')}>
        {t('appUpdate.readyBody')}
      </Notice>
      <Button variant="secondary" label={t('appUpdate.restart')} onPress={update.restart} />
    </>
  );
}

/**
 * "Version 1.0.0 · update of 01-10-2026 15:30 (a1b2c3d4)": tells a tester, and whoever reads a
 * bug report, which version the phone runs. Nothing in development or on the web.
 */
export function VersionLine() {
  const { t } = useTranslation();
  const running = runningVersion();
  if (!running) return null;
  return (
    <AppText variant="small" tone="muted" style={styles.centre}>
      {running.kind === 'update'
        ? t('appUpdate.versionUpdate', { version: running.version, date: running.date, id: running.id })
        : t('appUpdate.versionInstalled', { version: running.version, date: running.date })}
    </AppText>
  );
}

const styles = StyleSheet.create({
  centre: {
    textAlign: 'center',
  },
});
