// C6 Who is here now, for coordinators and the Guru: every student checked in and not yet
// checked out, with the time they came. Each can be checked out with a tap, and "Check out all"
// closes every visit at closing time in one database call (check_out_all, docs/DECISIONS.md
// #18). "Check out all" lives here, not on C5, so the coordinator sees exactly who it affects.

import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { MessageKey } from '@/auth/auth-actions';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { ListRow } from '@/components/list-row';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { VisitResultNotice } from '@/components/visit-result-notice';
import {
  checkOutAll,
  fetchAttendanceToday,
  markVisit,
  type AttendanceToday,
  type MarkOutcome,
  type OpenVisit,
} from '@/data/attendance';
import { formatDuration } from '@/i18n/labels';
import { dateInIndia, formatDayMonthYear, timeInIndia, todayInIndia } from '@/lib/dates';

/** List of open visits, one check-out button each, and "Check out all" with a confirm step. */
export default function HereNowScreen() {
  const { t } = useTranslation();
  // undefined = loading, null = could not load.
  const [today, setToday] = useState<AttendanceToday | null | undefined>(undefined);
  const [outcome, setOutcome] = useState<MarkOutcome | null>(null);
  const [closedAll, setClosedAll] = useState<number | null>(null);
  const [allError, setAllError] = useState<MessageKey | null>(null);
  const [markingId, setMarkingId] = useState<string | null>(null);
  // "Check out all" asks once more on the screen itself; a pop-up dialog does not work on the web.
  const [confirming, setConfirming] = useState(false);
  const [busyAll, setBusyAll] = useState(false);

  const load = useCallback(async () => {
    setToday(await fetchAttendanceToday());
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  function clearMessages() {
    setOutcome(null);
    setClosedAll(null);
    setAllError(null);
  }

  async function checkOutOne(visit: OpenVisit) {
    clearMessages();
    setMarkingId(visit.studentId);
    setOutcome(await markVisit(visit.studentId, 'out'));
    await load();
    setMarkingId(null);
  }

  async function checkOutEveryone() {
    clearMessages();
    setBusyAll(true);
    const result = await checkOutAll();
    setBusyAll(false);
    setConfirming(false);
    if (result.closed !== undefined) setClosedAll(result.closed);
    else setAllError(result.errorKey ?? 'common.genericError');
    void load();
  }

  /** "Since 16:05 · 1 h 10 min", or the date too when the visit was left open on an earlier day. */
  function sinceText(visit: OpenVisit, loadedAt: number): string {
    const day = dateInIndia(visit.checkIn);
    const time = timeInIndia(visit.checkIn);
    if (day !== todayInIndia()) {
      return t('hereNow.sinceEarlierDay', { date: formatDayMonthYear(day), time });
    }
    const minutes = (loadedAt - Date.parse(visit.checkIn)) / 60_000;
    return t('hereNow.since', { time, duration: formatDuration(t, minutes) });
  }

  const header = <Stack.Screen options={{ title: t('hereNow.title') }} />;

  if (today === null) {
    return (
      <Screen underHeader centred>
        {header}
        <Notice tone="error" title={t('attendance.loadFailed')}>
          {t('common.networkError')}
        </Notice>
        <Button icon="refresh" label={t('common.tryAgain')} onPress={() => void load()} />
      </Screen>
    );
  }

  return (
    <Screen underHeader onRefresh={load}>
      {header}
      {today ? (
        <AppText variant="label">{t('hereNow.count', { number: today.hereNow.length })}</AppText>
      ) : (
        <LoadingCards />
      )}

      {outcome?.result ? <VisitResultNotice result={outcome.result} /> : null}
      {outcome?.errorKey ? <Notice tone="error">{t(outcome.errorKey)}</Notice> : null}
      {closedAll !== null ? (
        <Notice tone="success">{t('hereNow.allCheckedOut', { number: closedAll })}</Notice>
      ) : null}
      {allError ? <Notice tone="error">{t(allError)}</Notice> : null}

      {today?.hereNow.length === 0 ? <EmptyState icon="hereNow" title={t('hereNow.empty')} /> : null}
      {today?.hereNow.map((visit) => (
        <ListRow
          key={visit.visitId}
          leading="initials"
          title={visit.fullName}
          chips={{ levelId: visit.levelId }}
          details={[visit.rollNo, sinceText(visit, today.loadedAt)]}
          action={{
            label: t('attendance.checkOut'),
            variant: 'secondary',
            loading: markingId === visit.studentId,
            disabled: busyAll || (markingId !== null && markingId !== visit.studentId),
            onPress: () => void checkOutOne(visit),
          }}
        />
      ))}

      <Button variant="secondary" icon="refresh" label={t('hereNow.refresh')} onPress={() => void load()} />

      {today && today.hereNow.length > 0 ? (
        confirming ? (
          <>
            <Notice tone="info" title={t('hereNow.confirmTitle', { number: today.hereNow.length })}>
              {t('hereNow.confirmBody')}
            </Notice>
            <Button
              label={t('hereNow.confirmYes')}
              loading={busyAll}
              onPress={() => void checkOutEveryone()}
            />
            <Button variant="link" label={t('hereNow.cancel')} onPress={() => setConfirming(false)} />
          </>
        ) : (
          <Button
            label={t('hereNow.checkOutAll')}
            disabled={markingId !== null}
            onPress={() => {
              clearMessages();
              setConfirming(true);
            }}
          />
        )
      ) : null}
    </Screen>
  );
}
