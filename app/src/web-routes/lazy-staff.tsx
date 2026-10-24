// Stand-ins for the staff screens on the web (docs/DECISIONS.md #590): each loads the staff area (staff-area.ts) the
// first time any staff screen opens, shows "Loading…" meanwhile, and then the real screen with the same props. A load
// that fails (no signal before the area was ever loaded on this device) says so with Try again; it is never cached, so
// the next try asks again. preloadStaffArea starts the download as soon as a staff login is known, so the staff home
// rarely waits at all.

import { useEffect, useState, type ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Notice } from '@/components/notice';
import { keepOfflineShell } from '@/lib/offline-shell';
import { spacing, useTheme } from '@/theme/use-theme';

type StaffArea = typeof import('./staff-area');

let area: StaffArea | null = null;
let loading: Promise<StaffArea> | null = null;

/** Loads the staff area once; a failed load is forgotten, so the next call tries again. */
export function loadStaffArea(): Promise<StaffArea> {
  if (area) return Promise.resolve(area);
  loading ??= import('./staff-area').then(
    (loaded) => {
      area = loaded;
      // The service worker keeps the file now that it is loaded (it is not in the install list, #591).
      keepOfflineShell();
      return loaded;
    },
    (error: unknown) => {
      loading = null;
      throw error;
    },
  );
  return loading;
}

/** Starts loading the staff area in the background (a staff login was just recognised). Never throws. */
export function preloadStaffArea(): void {
  loadStaffArea().catch(() => undefined);
}

/** The stand-in component for one staff route (its key in route-context.ts). */
export function lazyStaffScreen(key: string): ComponentType<object> {
  function StaffScreen(props: object) {
    // The real screen, once the area is in (a function in state is stored with the updater form).
    const [Screen, setScreen] = useState<ComponentType<object> | null>(() => (area ? area.staffScreen(key) : null));
    const [failed, setFailed] = useState(false);
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
      if (Screen) return;
      let live = true;
      loadStaffArea().then(
        (done) => live && setScreen(() => done.staffScreen(key)),
        () => live && setFailed(true),
      );
      return () => {
        live = false;
      };
    }, [Screen, attempt]);
    if (Screen) return <Screen {...props} />;
    return <Waiting failed={failed} onRetry={() => (setFailed(false), setAttempt((n) => n + 1))} />;
  }
  StaffScreen.displayName = `StaffScreen(${key})`;
  return StaffScreen;
}

/** "Loading…" while the staff area comes, or the message with Try again when it could not. */
function Waiting({ failed, onRetry }: { failed: boolean; onRetry: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View style={[styles.page, { backgroundColor: colors.background }]}>
      {failed ? (
        <>
          <Notice tone="error">{t('webArea.loadFailed')}</Notice>
          <Button icon="refresh" label={t('common.tryAgain')} onPress={onRetry} />
        </>
      ) : (
        <ActivityIndicator color={colors.primary} size="large" accessibilityLabel={t('common.loading')} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, justifyContent: 'center', padding: spacing.lg, gap: spacing.md },
});
