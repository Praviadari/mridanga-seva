// S9 Attendance history for the signed-in student: finds their student record, then shows the
// shared history (src/screens/visit-history.tsx). Opened from the ring on the student home (S1).

import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/button';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { fetchMyStudent, type MyStudent } from '@/data/visits';
import { VisitHistoryScreen } from '@/screens/visit-history';

/** My visits by month. */
export default function MyVisitsScreen() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const myId = profile?.id ?? '';
  const [me, setMe] = useState<MyStudent | 'not_found' | null | undefined>(undefined);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void fetchMyStudent(myId).then((found) => {
      if (!cancelled) setMe(found);
    });
    return () => {
      cancelled = true;
    };
  }, [myId, attempt]);

  if (me && me !== 'not_found') return <VisitHistoryScreen studentId={me.id} />;

  return (
    <Screen underHeader centred>
      <Stack.Screen options={{ title: t('visitHistory.title') }} />
      {me === undefined ? <LoadingCards /> : null}
      {me === 'not_found' ? (
        <Notice tone="info" title={t('myQr.noRecordTitle')}>
          {t('myQr.noRecordBody')}
        </Notice>
      ) : null}
      {me === null ? (
        <>
          <Notice tone="error" title={t('visitHistory.loadFailed')}>
            {t('common.networkError')}
          </Notice>
          <Button icon="refresh" label={t('common.tryAgain')} onPress={() => setAttempt((n) => n + 1)} />
        </>
      ) : null}
      <Button variant="link" icon="home" label={t('comingSoon.back')} onPress={() => router.navigate('/student')} />
    </Screen>
  );
}
