// Follow-ups per coordinator, from the Follow-up calls circle on the Guru home (simple home,
// docs/DECISIONS.md #240): the overdue and escalated calls of each coordinator, each opening C10 for
// that coordinator, and a button to all calls. A coordinator's circle opens C10 (my students) instead.
// Numbers: guru_dashboard() through src/data/home.ts.

import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/button';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { fetchGuruDashboard, type GuruDashboard } from '@/data/home';
import { GuruFollowUps } from '@/screens/guru-home';

/** Follow-ups per coordinator. */
export default function FollowUpsByCoordinatorScreen() {
  const { t } = useTranslation();
  // undefined = loading, null = could not load.
  const [board, setBoard] = useState<GuruDashboard | null | undefined>(undefined);

  const load = useCallback(async () => {
    setBoard(await fetchGuruDashboard());
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <Screen underHeader onRefresh={load}>
      <Stack.Screen options={{ title: t('staff.followUp') }} />
      {board === undefined ? <LoadingCards /> : null}
      {board === null ? (
        <>
          <Notice tone="error" title={t('home.loadFailed')}>
            {t('common.networkError')}
          </Notice>
          <Button variant="secondary" icon="refresh" label={t('common.tryAgain')} onPress={() => void load()} />
        </>
      ) : null}
      {board ? <GuruFollowUps board={board} /> : null}
    </Screen>
  );
}