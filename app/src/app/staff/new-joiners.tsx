// New joiners, from a circle on the staff homes and the New joiners number on Overview (simple
// home, docs/DECISIONS.md #240): the students who joined in the last few weeks
// (settings.new_joiner_weeks), newest first, with their visits; each opens C8. The list is the whole
// class's, for the Guru and coordinators alike (coordinator_dashboard() through src/data/home.ts).

import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/button';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { fetchCoordinatorDashboard, type CoordinatorDashboard } from '@/data/home';
import { NewJoinersList } from '@/screens/coordinator-home';

/** The new joiners of the last few weeks. */
export default function NewJoinersScreen() {
  const { t } = useTranslation();
  // undefined = loading, null = could not load.
  const [board, setBoard] = useState<CoordinatorDashboard | null | undefined>(undefined);

  const load = useCallback(async () => {
    setBoard(await fetchCoordinatorDashboard());
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <Screen underHeader onRefresh={load}>
      <Stack.Screen options={{ title: t('home.modules.newJoiners') }} />
      {board === undefined ? <LoadingCards /> : null}
      {board === null ? (
        <>
          <Notice tone="error" title={t('home.loadFailed')}>
            {t('common.networkError')}
          </Notice>
          <Button variant="secondary" icon="refresh" label={t('common.tryAgain')} onPress={() => void load()} />
        </>
      ) : null}
      {board ? <NewJoinersList board={board} /> : null}
    </Screen>
  );
}