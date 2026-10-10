// Overview, from the first circle on the staff homes (simple home, docs/DECISIONS.md #240): what used
// to be the top of C1 / G1. The Guru gets the whole class (GuruOverview: numbers, level-up queue,
// students per level and per status); a coordinator the day's numbers (CoordinatorOverview). Each
// number that is a list opens it, filtered (C6, C5, C10 mine, C7 not left, new joiners).
// Numbers: guru_dashboard() / coordinator_dashboard() through src/data/home.ts.

import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/button';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { fetchCoordinatorDashboard, fetchGuruDashboard, type CoordinatorDashboard, type GuruDashboard } from '@/data/home';
import { CoordinatorOverview } from '@/screens/coordinator-home';
import { GuruOverview } from '@/screens/guru-home';

type Loaded = { guru: GuruDashboard } | { coordinator: CoordinatorDashboard };

/** The numbers of the staff home. */
export default function OverviewScreen() {
  const { t } = useTranslation();
  const { area } = useAuth();
  const isGuru = area === 'guru';
  // undefined = loading, null = could not load.
  const [loaded, setLoaded] = useState<Loaded | null | undefined>(undefined);

  const load = useCallback(async () => {
    if (isGuru) {
      const board = await fetchGuruDashboard();
      setLoaded(board ? { guru: board } : null);
    } else {
      const board = await fetchCoordinatorDashboard();
      setLoaded(board ? { coordinator: board } : null);
    }
  }, [isGuru]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <Screen underHeader wide onRefresh={load}>
      <Stack.Screen options={{ title: t('home.modules.overview') }} />
      {loaded === undefined ? <LoadingCards kind="tiles" /> : null}
      {loaded === null ? (
        <>
          <Notice tone="error" title={t('home.loadFailed')}>
            {t('common.networkError')}
          </Notice>
          <Button variant="secondary" icon="refresh" label={t('common.tryAgain')} onPress={() => void load()} />
        </>
      ) : null}
      {loaded && 'guru' in loaded ? <GuruOverview board={loaded.guru} /> : null}
      {loaded && 'coordinator' in loaded ? <CoordinatorOverview board={loaded.coordinator} /> : null}
    </Screen>
  );
}