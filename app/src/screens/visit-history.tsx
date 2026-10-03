// S9 Attendance history: one student's visits, newest month first. Each month shows how many
// visits and hours, then one line per visit with the day, the time in and out and how long. The
// last three months load first; "Show earlier months" adds three more. Shown by two routes:
// student/visits.tsx (my own visits, from the ring on S1) and staff/visits/[id].tsx (from C8
// Student profile). Data: src/data/visits.ts. Read-only.

import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { fetchVisitHistory, MONTHS_PER_PAGE, type VisitHistory } from '@/data/visits';
import { formatDuration, monthName } from '@/i18n/labels';
import { dateInIndia, formatDayMonthYear, timeInIndia } from '@/lib/dates';

/** Props for VisitHistoryScreen. */
export type VisitHistoryScreenProps = {
  studentId: string;
  /** For staff: the student's name and roll number, shown at the top. */
  subtitle?: string;
};

/** The visits of one student by month. */
export function VisitHistoryScreen({ studentId, subtitle }: VisitHistoryScreenProps) {
  const { t } = useTranslation();
  const [months, setMonths] = useState(MONTHS_PER_PAGE);
  // undefined = loading, null = could not load.
  const [history, setHistory] = useState<VisitHistory | null | undefined>(undefined);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async () => {
    setHistory(await fetchVisitHistory(studentId, months));
  }, [studentId, months]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function showEarlier() {
    setLoadingMore(true);
    const next = months + MONTHS_PER_PAGE;
    const loaded = await fetchVisitHistory(studentId, next);
    if (loaded) {
      setMonths(next);
      setHistory(loaded);
    }
    setLoadingMore(false);
  }

  return (
    <Screen underHeader onRefresh={load}>
      <Stack.Screen options={{ title: t('visitHistory.title') }} />
      {subtitle ? <AppText variant="subtitle">{subtitle}</AppText> : null}
      <AppText tone="muted">{t('visitHistory.intro')}</AppText>

      {history === undefined ? <LoadingCards /> : null}
      {history === null ? (
        <>
          <Notice tone="error" title={t('visitHistory.loadFailed')}>
            {t('common.networkError')}
          </Notice>
          <Button icon="refresh" label={t('common.tryAgain')} onPress={() => void load()} />
        </>
      ) : null}

      {history && history.months.length === 0 ? (
        <EmptyState
          icon="visits"
          title={history.hasEarlier ? t('visitHistory.noneRecently', { months }) : t('visitHistory.none')}
        />
      ) : null}

      {history
        ? history.months.map((month) => (
            <Section
              key={month.month}
              icon="visits"
              title={monthName(t, month.month)}
              description={t('visitHistory.monthLine', {
                count: month.visits.length,
                time: formatDuration(t, month.minutes),
              })}>
              {month.visits.map((visit) => (
                <AppText key={visit.id}>
                  {`${formatDayMonthYear(dateInIndia(visit.checkIn))} · ${timeInIndia(visit.checkIn)}`}
                  {visit.checkOut
                    ? `–${timeInIndia(visit.checkOut)} · ${formatDuration(
                        t,
                        (Date.parse(visit.checkOut) - Date.parse(visit.checkIn)) / 60_000,
                      )}`
                    : ` · ${t('profile.stillHere')}`}
                </AppText>
              ))}
            </Section>
          ))
        : null}

      {history?.hasEarlier ? (
        <Button
          variant="secondary"
          icon="visits"
          label={t('visitHistory.earlier')}
          loading={loadingMore}
          disabled={loadingMore}
          onPress={() => void showEarlier()}
        />
      ) : null}
    </Screen>
  );
}
