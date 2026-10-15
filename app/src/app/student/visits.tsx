// S9 Attendance history for the signed-in student: finds their student record, then shows the
// shared history (src/screens/visit-history.tsx). Opened from the ring on the student home (S1).
// Since 15-10-2026 (#382) the top shows this week's visits and the weeks in a row with a visit (lib/streak.ts, from
// the months below) and the last visit as one line (student_home() through src/data/home.ts); before, the second box
// was the days since the last visit, once on the home (#240).

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
import { fetchMyStudent, type MyStudent, type VisitHistory } from '@/data/visits';
import { lastVisitText } from '@/i18n/labels';
import { localDate, todayLocal } from '@/lib/dates';
import { weeksInARow } from '@/lib/streak';
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
    return <VisitHistoryScreen studentId={me.id} top={(history) => <WeekNumbers history={history} home={week} />} />;
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
      <Button variant="link" icon="home" label={t('comingSoon.back')} onPress={() => router.dismissTo('/student')} />
    </Screen>
  );
}

/**
 * This week's visits and the weeks in a row with a visit (lib/streak.ts, counted from the months below once they
 * load), and the last visit as one line (#382: what the student keeps up, not "days since your last visit", a staff
 * measure that read as blame; this month's figures are already on the month's card below).
 */
function WeekNumbers({ history, home }: { history: VisitHistory | null | undefined; home: StudentHome | null }) {
  const { t } = useTranslation();
  const streak = history
    ? weeksInARow(
        history.months.flatMap((month) => month.visits.map((visit) => localDate(visit.checkIn))),
        todayLocal(),
      )
    : null;
  return (
    <>
      {home || streak !== null ? (
        <StatGrid>
          {home ? (
            <StatTile
              icon="visits"
              value={String(home.visitsThisWeek)}
              label={home.weekStarts === 'rolling7' ? t('weekMeaning.studentRolling') : t('home.student.visitsThisWeek')}
            />
          ) : null}
          {streak !== null ? <StatTile icon="attended" value={String(streak)} label={t('visitHistory.weeksInARow')} /> : null}
        </StatGrid>
      ) : null}
      {home ? (
        <AppText variant="small" tone="muted">
          {lastVisitText(t, home)}
        </AppText>
      ) : null}
    </>
  );
}
