// C5 Mark attendance, for coordinators and the Guru. Two ways to check a student in or out:
// scan the QR code on the student's phone (My QR), or search the name and tap. The search is
// also the fallback when there is no camera, e.g. the web version on a laptop.
// A scan toggles (in, or out if already in); a tap does what its button says and nothing if
// the student is already in that state (docs/DECISIONS.md #18). The database functions are
// called through src/data/attendance.ts.

import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { ListRow } from '@/components/list-row';
import { Notice } from '@/components/notice';
import { QrScanner } from '@/components/qr-scanner';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { TextField } from '@/components/text-field';
import { VisitResultNotice } from '@/components/visit-result-notice';
import {
  fetchAttendanceToday,
  markVisit,
  MIN_SEARCH_LENGTH,
  qrTokenFromScan,
  scanStudentQr,
  searchStudents,
  type AttendanceToday,
  type FoundStudent,
  type MarkOutcome,
} from '@/data/attendance';
import { dateInIndia, formatDayMonthYear, timeInIndia, todayInIndia } from '@/lib/dates';

/**
 * How long the same QR code is ignored after it was read, in milliseconds. The camera sees a
 * code many times a second; without this, a student still holding up their phone when the
 * coordinator taps "Scan the next student" would be checked straight out again.
 */
const SAME_CODE_PAUSE_MS = 30_000;

/** Wait after the last key press before searching, in milliseconds, so typing stays smooth. */
const SEARCH_DELAY_MS = 300;

/** Scanner, result card and name search. */
export default function MarkAttendanceScreen() {
  const { t } = useTranslation();

  // undefined = loading, null = could not load.
  const [today, setToday] = useState<AttendanceToday | null | undefined>(undefined);
  const [outcome, setOutcome] = useState<MarkOutcome | null>(null);

  const [cameraOpen, setCameraOpen] = useState(false);
  // After each scan the camera stops reading until the coordinator asks for the next student.
  const [scanPaused, setScanPaused] = useState(false);
  // Refs, not state: the camera can report the same code again before the screen re-renders.
  const working = useRef(false);
  const lastCode = useRef<{ token: string; at: number } | null>(null);

  const [query, setQuery] = useState('');
  // undefined = nothing searched yet, null = the search failed.
  const [found, setFound] = useState<FoundStudent[] | null | undefined>(undefined);
  const [markingId, setMarkingId] = useState<string | null>(null);

  const loadToday = useCallback(async () => {
    setToday(await fetchAttendanceToday());
  }, []);

  // Reload whenever the screen comes back into view, e.g. after "Who is here now".
  useFocusEffect(
    useCallback(() => {
      void loadToday();
    }, [loadToday]),
  );

  const searching = query.trim().length >= MIN_SEARCH_LENGTH;
  useEffect(() => {
    if (!searching) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const result = await searchStudents(query);
      if (!cancelled) setFound(result);
    }, SEARCH_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, searching]);
  // Results of the last search, hidden while the text is too short to search.
  const shown = searching ? found : undefined;

  async function onScan(text: string) {
    if (working.current) return;
    const token = qrTokenFromScan(text);
    const now = Date.now();
    if (token && lastCode.current?.token === token && now - lastCode.current.at < SAME_CODE_PAUSE_MS) {
      return; // the result card for this student is already on screen
    }
    working.current = true;
    setScanPaused(true);
    const scanned: MarkOutcome = token ? await scanStudentQr(token) : { result: { action: 'unknown' } };
    // Remember the code only when it worked, so a scan that failed (no internet) can be retried.
    lastCode.current = token && scanned.result ? { token, at: now } : null;
    setOutcome(scanned);
    working.current = false;
    void loadToday();
  }

  async function onTap(student: FoundStudent, action: 'in' | 'out') {
    setMarkingId(student.id);
    setOutcome(await markVisit(student.id, action));
    // Keep the spinner until the list is fresh, so the button never shows the old meaning.
    await loadToday();
    setMarkingId(null);
  }

  // When each student found by the search checked in, if they are here now.
  const hereSince = new Map(today?.hereNow.map((visit) => [visit.studentId, visit.checkIn]));

  /** "Here since 16:05", or with the date for a visit left open on an earlier day. */
  function sinceText(checkIn: string): string {
    const day = dateInIndia(checkIn);
    const time = timeInIndia(checkIn);
    return day === todayInIndia()
      ? t('attendance.hereSince', { time })
      : t('hereNow.sinceEarlierDay', { date: formatDayMonthYear(day), time });
  }

  return (
    <Screen underHeader>
      <Stack.Screen options={{ title: t('attendance.title') }} />

      {today === null ? (
        <Notice tone="error" title={t('attendance.loadFailed')}>
          {t('common.networkError')}
        </Notice>
      ) : today ? (
        <AppText variant="label">
          {t('attendance.summary', { here: today.hereNow.length, visits: today.visitsToday })}
        </AppText>
      ) : (
        <AppText tone="muted">{t('common.loading')}</AppText>
      )}
      <Button
        variant="secondary"
        icon="hereNow"
        label={t('staff.hereNow')}
        onPress={() => router.push('/staff/here-now')}
      />

      {outcome?.result ? <VisitResultNotice result={outcome.result} /> : null}
      {outcome?.errorKey ? <Notice tone="error">{t(outcome.errorKey)}</Notice> : null}

      <Section icon="attendance" title={t('attendance.scanSection')} description={t('attendance.scanIntro')}>
        {cameraOpen ? (
          <>
            <QrScanner onScan={(text) => void onScan(text)} paused={scanPaused} />
            {scanPaused ? (
              <Button
                label={t('attendance.scanNext')}
                onPress={() => {
                  setOutcome(null);
                  setScanPaused(false);
                }}
              />
            ) : null}
            <Button
              variant="secondary"
              label={t('attendance.stopScan')}
              onPress={() => {
                setCameraOpen(false);
                setScanPaused(false);
              }}
            />
          </>
        ) : (
          <Button icon="qr" label={t('attendance.startScan')} onPress={() => setCameraOpen(true)} />
        )}
      </Section>

      <Section icon="search" title={t('attendance.searchSection')}>
        <TextField
          label={t('attendance.searchLabel')}
          hint={t('attendance.searchHint')}
          value={query}
          onChangeText={setQuery}
          autoComplete="off"
          autoCorrect={false}
          returnKeyType="search"
        />
        {shown === null ? <Notice tone="error">{t('attendance.searchFailed')}</Notice> : null}
        {shown?.length === 0 ? <AppText tone="muted">{t('attendance.noMatch')}</AppText> : null}
        {shown?.map((student) => {
          const since = hereSince.get(student.id);
          return (
            <ListRow
              key={student.id}
              leading="initials"
              title={student.fullName}
              chips={{ levelId: student.levelId }}
              details={[
                student.rollNo,
                ...(since ? [sinceText(since)] : []),
              ]}
              highlighted={!!since}
              action={{
                label: since ? t('attendance.checkOut') : t('attendance.checkIn'),
                variant: since ? 'secondary' : 'primary',
                loading: markingId === student.id,
                // Wait for today's list, so the button's meaning (in / out) is known.
                disabled: !today || (markingId !== null && markingId !== student.id),
                onPress: () => void onTap(student, since ? 'out' : 'in'),
              }}
            />
          );
        })}
      </Section>
    </Screen>
  );
}
