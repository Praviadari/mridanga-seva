// S9 Attendance history for the signed-in student: finds their student record, then shows the
// shared history (src/screens/visit-history.tsx). Opened from the ring on the student home (S1).
// Since the simple home (docs/DECISIONS.md #240) this week's visits and the days since the last
// visit, once on the home, are at the top (student_home() through src/data/home.ts).

import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { StatGrid, StatTile } from '@/components/stat-tile';
import { fetchStudentHome, type StudentHome } from '@/data/home';
import { fetchMyStudent, type MyStudent } from '@/data/visits';
import { lastVisitText } from '@/i18n/labels';
import { VisitHistoryScreen } from '@/screens/visit-history';

/** My visits by month. */
export default function MyVisitsScreen() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const myId = profile?.id ?? '';
  const [me, setMe] = useState<MyStudent | 'not_found' | null | undefined>(undefined);
  // The week's numbers; left out when they do not load (the months below still show).
  const [week, setWeek] = useState<StudentHome | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([fetchMyStudent(myId), fetchStudentHome()]).then(([found, home]) => {
      if (cancelled) return;
      setMe(found);
      setWeek(home && home !== 'not_found' ? home : null);
    });
    return () => {
      cancelled = true;
    };
  }, [myId, attempt]);

  if (me && me !== 'not_found') {
    return (
      <VisitHistoryScreen
        studentId={me.id}
        top={week ? <WeekNumbers home={week} /> : null}
      />
    );
  }

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

/** Visits this week and days since the last visit, as on the home before #240. */
function WeekNumbers({ home }: { home: StudentHome }) {
  const { t } = useTranslation();
  return (
    <>
      <StatGrid>
        <StatTile
          icon="visits"
          value={String(home.visitsThisWeek)}
          label={home.weekStarts === 'rolling7' ? t('weekMeaning.studentRolling') : t('home.student.visitsThisWeek')}
        />
        <StatTile
          icon="time"
          // Never came: no number of days to show; the line below says "No visit yet".
          value={home.lastVisitAt ? String(home.daysSinceVisit) : '—'}
          spokenValue={home.lastVisitAt ? undefined : t('home.student.noVisitYet')}
          label={t('home.student.daysSinceVisit')}
        />
      </StatGrid>
      <AppText variant="small" tone="muted">
        {lastVisitText(t, home)}
      </AppText>
    </>
  );
}
