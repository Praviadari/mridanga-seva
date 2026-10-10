// "A new version is ready" with a Restart button, and the small version line, for the three home
// screens (S1, C1, G1) and the pending screen. Staff screens show the notice at their top too (FLOW-06): the door
// phone stays on the scanner for hours, so the staff layout sets UpdateNoticeOnScreens and components/screen.tsx
// shows it above the content. Android app only: on the web both render nothing (src/lib/app-update.web.ts).

import { createContext, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

import { runningVersion, useAppUpdate } from '@/lib/app-update';

import { AppText } from './app-text';
import { Button } from './button';
import { Notice } from './notice';

/** True inside a part of the app whose screens show UpdateNotice at the top (the staff screens, FLOW-06). */
export const UpdateNoticeOnScreens = createContext(false);

/**
 * Shows a notice and a Restart button once a newer version is downloaded; otherwise nothing. If
 * the app cannot restart itself, it says to close and reopen the app, and shows the technical
 * reason (src/lib/app-update.ts) so a tester can send it.
 */
export function UpdateNotice() {
  const { t } = useTranslation();
  const update = useAppUpdate();
  const [restarting, setRestarting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  if (!update.ready) return null;

  async function restart() {
    setFailure(null);
    setRestarting(true);
    // Settles only when the restart did not happen.
    setFailure(await update.restart());
    setRestarting(false);
  }

  return (
    <>
      <Notice tone="success" title={t('appUpdate.readyTitle')}>
        {t('appUpdate.readyBody')}
      </Notice>
      <Button
        variant="secondary"
        label={t('appUpdate.restart')}
        loading={restarting}
        onPress={() => void restart()}
      />
      {failure ? (
        <>
          <Notice tone="error" title={t('appUpdate.restartFailedTitle')}>
            {t('appUpdate.restartFailedBody')}
          </Notice>
          {/* Technical detail for the maintainer, so not translated. */}
          <AppText variant="small" tone="muted" selectable>
            {failure}
          </AppText>
        </>
      ) : null}
    </>
  );
}

/**
 * "Version 1.0.0 · update of 01-10-2026 15:30 (a1b2c3d4)": tells a tester, and whoever reads a
 * bug report, which version the phone runs. On the web: "Web version test · 244e9f8 · 07-10-2026 15:30",
 * the site, commit and export time (docs/DECISIONS.md #144). Nothing in development.
 */
export function VersionLine() {
  const { t } = useTranslation();
  const running = runningVersion();
  if (!running) return null;
  return (
    <AppText variant="small" tone="muted" style={styles.centre}>
      {running.kind === 'web'
        ? t('appUpdate.versionWeb', { site: running.site, commit: running.commit, date: running.date })
        : running.kind === 'update'
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
