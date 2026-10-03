// S6 Practice log (Phase 2 slice 3, docs/DECISIONS.md #54): the student's practice by week (8
// weeks, from Monday), the entries of those weeks (from the S5 timer or typed in), a form to type in
// practice (a day of the last 7, 1-240 minutes, a note) and Delete for an entry of the last 14 days.
// Opened from S5 Practice tools and from S4 My progress. Data: data/practice.ts; the limits are
// the database's (log_practice in supabase/migrations/0018_practice.sql).

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
import { practiceTime, WeeklyPractice } from '@/components/practice-parts';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { TextField } from '@/components/text-field';
import { deletePractice, fetchMyPracticeLog, fetchTaals, logPractice, type PracticeLog } from '@/data/practice';
import { formatDayMonthYear, todayInIndia } from '@/lib/dates';

/** 'YYYY-MM-DD' of the day `back` days before today in India. */
function dayBefore(back: number): string {
  const [y, m, d] = todayInIndia().split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d - back)).toISOString().slice(0, 10);
}

/** The student's practice log. */
export default function PracticeLogScreen() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const profileId = profile?.id ?? '';
  const [log, setLog] = useState<PracticeLog | 'not_found' | null | undefined>(undefined);
  const [taalNames, setTaalNames] = useState<Map<number, string>>(new Map());

  const [day, setDay] = useState(0);
  const [minutes, setMinutes] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [confirming, setConfirming] = useState<number | null>(null);

  const load = useCallback(async () => {
    const [loaded, taals] = await Promise.all([fetchMyPracticeLog(profileId), fetchTaals()]);
    setLog(loaded);
    setTaalNames(new Map(taals.taals.map((tl) => [tl.id, tl.name])));
  }, [profileId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const save = async () => {
    const value = Number(minutes.trim());
    if (!Number.isInteger(value) || value < 1 || value > 240) {
      setMessage({ tone: 'error', text: t('practiceLog.errors.minutes_invalid') });
      return;
    }
    setSaving(true);
    const errorKey = await logPractice({ minutes: value, source: 'manual', practisedOn: dayBefore(day), note });
    setSaving(false);
    if (errorKey) {
      setMessage({ tone: 'error', text: t(errorKey) });
      return;
    }
    setMessage({ tone: 'success', text: t('practiceLog.saved', { time: practiceTime(t, value) }) });
    setMinutes('');
    setNote('');
    void load();
  };

  const remove = async (id: number) => {
    if (confirming !== id) {
      setConfirming(id);
      return;
    }
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
            label: back === 0 ? t('practiceLog.today') : back === 1 ? t('practiceLog.yesterday') : formatDayMonthYear(dayBefore(back)),
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
        {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
        <Button icon="add" label={t('practiceLog.save')} loading={saving} onPress={() => void save()} />
      </Section>

      <Section icon="syllabus" title={t('practiceLog.entries')}>
        {log.entries.length === 0 ? <EmptyState icon="time" title={t('practiceLog.empty')} /> : null}
        {log.entries.map((entry) => (
          <ListRow
            key={entry.id}
            leading={entry.source === 'timer' ? 'time' : 'edit'}
            title={`${practiceTime(t, entry.minutes)} · ${formatDayMonthYear(entry.practisedOn)}`}
            details={[
              t(entry.source === 'timer' ? 'practiceLog.fromTimer' : 'practiceLog.typedIn'),
              ...(entry.taalId !== null && taalNames.has(entry.taalId) ? [taalNames.get(entry.taalId) as string] : []),
              ...(entry.note ? [entry.note] : []),
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
