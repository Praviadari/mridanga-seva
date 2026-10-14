// Waiting for you, from the amber box on the staff homes (launch UI, docs/DECISIONS.md #351): the team decided the
// home does not scroll, so the rows of what waits (sign-ups at the desk, follow-ups, promotions, fund entries,
// recordings to review, material suggestions) moved here from under the circles; the home shows only their total.
// Numbers: staff_dashboard() through src/data/home.ts. It loads again each time it comes back into view.

import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/button';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { WaitingForYou } from '@/components/staff-today';
import { fetchStaffDashboard, type StaffDashboard } from '@/data/home';

/** What waits for this staff member. */
export default function WaitingScreen() {
  const { t } = useTranslation();
  const { area } = useAuth();
  const guru = area === 'guru';
  // undefined = loading, null = could not load.
  const [board, setBoard] = useState<StaffDashboard | null | undefined>(undefined);

  const load = useCallback(async () => {
    setBoard(await fetchStaffDashboard(guru));
  }, [guru]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <Screen underHeader onRefresh={load}>
      <Stack.Screen options={{ title: t('home.waiting.title') }} />
      {board === undefined ? <LoadingCards /> : null}
      {board === null ? (
        <>
          <Notice tone="error" title={t('home.loadFailed')}>
            {t('common.networkError')}
          </Notice>
          <Button variant="secondary" icon="refresh" label={t('common.tryAgain')} onPress={() => void load()} />
        </>
      ) : null}
      {board ? <WaitingForYou guru={guru} board={board} heading={false} /> : null}
    </Screen>
  );
}
