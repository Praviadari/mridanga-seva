// S6 Practice log (Phase 2 slice 3, docs/DECISIONS.md #54): the student's practice by week (8
// weeks, from Monday), the entries of those weeks (from the S5 timer or typed in), a form to type in
// practice (a day of the last 7, 1-240 minutes, a note) and Delete for an entry of the last 14 days.
// Opened from S5 Practice tools and from S4 My progress. Data: data/practice.ts; the limits are
// the database's (log_practice in supabase/migrations/0018_practice.sql). Since 0056 (#494) the form also asks
// "How did it go?" (three faces, what was practised; optional), and each entry shows what was said. A Save without a
// connection waits on the phone and is sent once the signal is back (lib/offline-send.ts, #593).

import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { ChoiceGroup } from '@/components/choice-group';
import { EmptyState } from '@/components/empty-state';
import { ListRow } from '@/components/list-row';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { FeelingFields, feelingWords } from '@/components/practice-feeling';
import { practiceTime, WeeklyPractice } from '@/components/practice-parts';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { TextField } from '@/components/text-field';
import { announce } from '@/lib/announce';
import { confirmReady, confirmShown } from '@/lib/second-tap';
import {
  deletePractice,
  fetchMyPracticeLog,
  fetchTaals,
  logPractice,
  setPracticeFeeling,
  type Feeling,
  type PracticeLog,
  type Practised,
} from '@/data/practice';
import { formatDate, todayLocal } from '@/lib/dates';
import { asciiDigits } from '@/lib/digits';
import { NETWORK, queuePractice } from '@/lib/offline-send';
import { notePractisedToday } from '@/lib/practice-reminder';
import { QueuedNotice } from '@/components/queued-notice';
import { useRequestId } from '@/lib/use-request-id';
import { RefreshFailed } from '@/components/refresh-failed';
import { useKeptLoad } from '@/lib/kept-load';

/** 'YYYY-MM-DD' of the day `back` days before today at the class. */
function dayBefore(back: number): string {
  const [y, m, d] = todayLocal().split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d - back)).toISOString().slice(0, 10);
}

/** The student's practice log. */
export default function PracticeLogScreen() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const profileId = profile?.id ?? '';
  const [log, setLog, refreshFailed] = useKeptLoad<PracticeLog | 'not_found' | null | undefined>();
  const [taalNames, setTaalNames] = useState<Map<number, string>>(new Map());

  const [day, setDay] = useState(0);
  const [minutes, setMinutes] = useState('');
  const [note, setNote] = useState('');
  // How it went (#494): optional, saved with the entry.
  const [feeling, setFeeling] = useState<Feeling | null>(null);
  const [practised, setPractised] = useState<Practised[]>([]);
  const [saving, setSaving] = useState(false);
  // #322: one id per entry being typed; a new one after it is saved.
  const { requestId, renew } = useRequestId();
  const [message, setMessage] = useState<{ tone: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [confirming, setConfirming] = useState<number | null>(null);

  const load = useCallback(async () => {
    const [loaded, taals] = await Promise.all([fetchMyPracticeLog(profileId), fetchTaals()]);
    setLog(loaded);
    setTaalNames(new Map(taals.taals.map((tl) => [tl.id, tl.name])));
  }, [profileId, setLog]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const save = async () => {
    // Digits of the Telugu or Hindi keyboard too (P1-09).
    const value = Number(asciiDigits(minutes.trim()));
    if (!Number.isInteger(value) || value < 1 || value > 240) {
      setMessage({ tone: 'error', text: t('practiceLog.errors.minutes_invalid') });
      return;
    }
    setSaving(true);
    const entry = { minutes: value, source: 'manual' as const, practisedOn: dayBefore(day), note };
    const saved = await logPractice(entry, requestId());
    if ('errorKey' in saved && saved.errorKey === NETWORK && profileId) {
      // No connection: the entry and how it went wait on the phone with this request id, sent once later (#593).
      queuePractice(profileId, requestId(), { ...entry, feeling, practised });
      renew();
      setSaving(false);
      setMessage({ tone: 'info', text: t('offlineQueue.practiceQueued', { time: practiceTime(t, value) }) });
      setMinutes('');
      setNote('');
      setFeeling(null);
      setPractised([]);
      return;
    }
    if ('errorKey' in saved) {
      setSaving(false);
      setMessage({ tone: 'error', text: t(saved.errorKey) });
      return;
    }
    renew();
    // The entry is kept even when how it went could not be saved; the message says so.
    const said = feeling !== null || practised.length > 0;
    const feelingError = said && saved.id !== null ? await setPracticeFeeling(saved.id, feeling, practised) : null;
    setSaving(false);
    setMessage(
      feelingError
        ? { tone: 'error', text: `${t('practiceLog.saved', { time: practiceTime(t, value) })} ${t('practiceExtras.feelingFailed')}` }
        : { tone: 'success', text: t('practiceLog.saved', { time: practiceTime(t, value) }) },
    );
    // Practice typed in for today: no practice reminder today (#402).
    void notePractisedToday(profileId, dayBefore(day));
    setMinutes('');
    setNote('');
    setFeeling(null);
    setPractised([]);
    void load();
  };

  const remove = async (id: number) => {
    if (confirming !== id) {
      setConfirming(id);
      confirmShown();
      // Only the button's words change; TalkBack does not read them again by itself (P2-01, #314).
      announce(t('practiceLog.confirmDelete'));
      return;
    }
    // "Yes, delete" sits where Delete was: a double tap must not delete unseen (P2-06, #332).
    if (!confirmReady()) return;
    setConfirming(null);
    const errorKey = await deletePractice(id);
    setMessage(errorKey ? { tone: 'error', text: t(errorKey) } : { tone: 'success', text: t('practiceLog.deleted') });
    void load();
  };

  const header = <Stack.Screen options={{ title: t('practiceLog.title') }} />;

  if (log === undefined || log === null || log === 'not_found') {
    return (
      <Screen underHeader centred>
        {header}
        {log === undefined ? <LoadingCards /> : null}
        {log === 'not_found' ? (
          <Notice tone="info" title={t('myQr.noRecordTitle')}>
            {t('myQr.noRecordBody')}
          </Notice>
        ) : null}
        {log === null ? (
          <>
            <Notice tone="error" title={t('practiceLog.loadFailed')}>
              {t('common.networkError')}
            </Notice>
            <Button icon="refresh" label={t('common.tryAgain')} onPress={() => void load()} />
          </>
        ) : null}
      </Screen>
    );
  }

  const oldestDeletable = dayBefore(13);

  return (
    <Screen underHeader onRefresh={load}>
      {/* F9 (#327): a failed refresh keeps what is shown and says so. */}
      <RefreshFailed at={refreshFailed} onRetry={() => load()} />
      {header}
      <Section icon="time" title={t('practiceLog.weeks')}>
        <WeeklyPractice weeks={log.weeks} />
      </Section>

      <Section icon="add" title={t('practiceLog.addTitle')} description={t('practiceLog.addIntro')}>
        <ChoiceGroup<number>
          chips
          label={t('practiceLog.day')}
          value={day}
          onChange={setDay}
          choices={Array.from({ length: 7 }, (_, back) => ({
            value: back,
            label: back === 0 ? t('practiceLog.today') : back === 1 ? t('practiceLog.yesterday') : formatDate(dayBefore(back)),
          }))}
        />
        <TextField
          label={t('practiceLog.minutes')}
          hint={t('practiceLog.minutesHint')}
          value={minutes}
          onChangeText={setMinutes}
          keyboardType="number-pad"
          maxLength={3}
        />
        <TextField label={t('practiceLog.note')} value={note} onChangeText={setNote} maxLength={200} />
        <FeelingFields feeling={feeling} onFeeling={setFeeling} practised={practised} onPractised={setPractised} />
        {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
        <QueuedNotice kind="practice" />
        <Button icon="add" label={t('practiceLog.save')} loading={saving} onPress={() => void save()} />
      </Section>

      <Section icon="syllabus" title={t('practiceLog.entries')}>
        {log.entries.length === 0 ? <EmptyState icon="time" title={t('practiceLog.empty')} /> : null}
        {log.entries.map((entry) => (
          <ListRow
            key={entry.id}
            leading={entry.source === 'timer' ? 'time' : 'edit'}
            title={`${practiceTime(t, entry.minutes)} · ${formatDate(entry.practisedOn)}`}
            details={[
              t(entry.source === 'timer' ? 'practiceLog.fromTimer' : 'practiceLog.typedIn'),
              ...(entry.taalId !== null && taalNames.has(entry.taalId) ? [taalNames.get(entry.taalId) as string] : []),
              ...(entry.note ? [entry.note] : []),
              ...(feelingWords(t, entry.feeling, entry.practised) ? [feelingWords(t, entry.feeling, entry.practised) as string] : []),
            ]}
            action={
              entry.practisedOn >= oldestDeletable
                ? {
                    label: confirming === entry.id ? t('practiceLog.confirmDelete') : t('practiceLog.delete'),
                    variant: confirming === entry.id ? 'primary' : 'secondary',
                    onPress: () => void remove(entry.id),
                  }
                : undefined
            }
          />
        ))}
        {log.entries.length > 0 ? (
          <AppText variant="small" tone="muted">
            {t('practiceLog.deleteHint')}
          </AppText>
        ) : null}
      </Section>
    </Screen>
  );
}
