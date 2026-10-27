// Stand-ins for the screens the web version loads later (docs/DECISIONS.md #590, #650): each loads its area (one file
// for all the area's screens: staff-area.ts or student-area.ts) the first time any of them opens,
// shows "Loading…" meanwhile, and then the real screen with the same props. A load that fails (no signal before the area
// was ever loaded on this device) says so with Try again; it is never cached, so the next try asks again. preloadArea
// starts a download as soon as the login is known (src/lib/web-areas.web.ts), so a screen rarely waits at all.

import { useEffect, useState, type ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Notice } from '@/components/notice';
import { keepOfflineShell } from '@/lib/offline-shell';
import { spacing, useTheme } from '@/theme/use-theme';

/** What an area file gives: the screen of one of its routes, by its key in route-context.ts. */
type Area = { screen: (key: string) => ComponentType<object> };

export type AreaName = 'staff' | 'student';

// One import() each, written out, so the export makes each area one file of its own.
const importers: Record<AreaName, () => Promise<Area>> = {
  staff: () => import('./staff-area'),
  student: () => import('./student-area'),
};

const areas = new Map<AreaName, Area>();
const loading = new Map<AreaName, Promise<Area>>();

/** Loads an area once; a failed load is forgotten, so the next call tries again. */
export function loadArea(name: AreaName): Promise<Area> {
  const area = areas.get(name);
  if (area) return Promise.resolve(area);
  let pending = loading.get(name);
  if (!pending) {
    pending = importers[name]().then(
      (loaded) => {
        areas.set(name, loaded);
        // The service worker keeps the file now that it is loaded (the staff file is not in its install list, #591).
        keepOfflineShell();
        return loaded;
      },
      (error: unknown) => {
        loading.delete(name);
        throw error;
      },
    );
    loading.set(name, pending);
  }
  return pending;
}

/** Starts loading an area in the background. Never throws. */
export function preloadArea(name: AreaName): void {
  loadArea(name).catch(() => undefined);
}

/** The stand-in component for one route of an area (its key in route-context.ts). */
export function lazyScreen(name: AreaName, key: string): ComponentType<object> {
  function LaterScreen(props: object) {
    // The real screen, once the area is in (a function in state is stored with the updater form).
    const [Screen, setScreen] = useState<ComponentType<object> | null>(() => areas.get(name)?.screen(key) ?? null);
    const [failed, setFailed] = useState(false);
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
      if (Screen) return;
      let live = true;
      loadArea(name).then(
        (done) => live && setScreen(() => done.screen(key)),
        () => live && setFailed(true),
      );
      return () => {
        live = false;
      };
    }, [Screen, attempt]);
    if (Screen) return <Screen {...props} />;
    return <Waiting failed={failed} onRetry={() => (setFailed(false), setAttempt((n) => n + 1))} />;
  }
  LaterScreen.displayName = `LaterScreen(${key})`;
  return LaterScreen;
}

/** "Loading…" while the area comes, or the message with Try again when it could not. */
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
