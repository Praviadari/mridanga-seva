// C16 Performers and Attendance of one event, for coordinators and the Guru. Both pick student
// records (students without the app too) from the students the event is for, or from every
// student ("Show all students").
// - Performers: each with a part (Mridanga, Kartal, Lead singer, Harmonium or typed); saving
//   tells new performers and changed parts (push + inbox). Until the event is over.
// - Attendance: tick who came, from the event's day on (India).
// Routes: staff/events/performers/[id].tsx, staff/events/attendance/[id].tsx. Data: src/data/events.ts.

import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Checkbox } from '@/components/checkbox';
import { ChoiceGroup } from '@/components/choice-group';
import { ListRow } from '@/components/list-row';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { TextField } from '@/components/text-field';
import {
  fetchEvent,
  fetchEventStudents,
  PART_MAX,
  saveAttendance,
  savePerformers,
  whenText,
  type ClassEvent,
  type EventStudent,
} from '@/data/events';
import { levelName } from '@/i18n/labels';

/** The parts offered as chips; any other can be typed. */
const PARTS = ['mridanga', 'kartal', 'leadSinger', 'harmonium'] as const;

/** The screen. `mode` picks performers or attendance. */
export function EventStudentsScreen({ id, mode }: { id: number; mode: 'performers' | 'attendance' }) {
  const { t } = useTranslation();
  const [event, setEvent] = useState<ClassEvent | 'not_found' | null | undefined>(undefined);
  const [students, setStudents] = useState<EventStudent[] | null | undefined>(undefined);
  const [everyone, setEveryone] = useState(false);
  const [search, setSearch] = useState('');
  // Performers: student id → part. Attendance: the ids ticked. Filled once from the database.
  const [parts, setParts] = useState<Map<string, string> | null>(null);
  const [ticked, setTicked] = useState<Set<string> | null>(null);
  const [newPart, setNewPart] = useState<string>(t('events.performers.parts.mridanga'));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    const [found, list] = await Promise.all([fetchEvent(id), fetchEventStudents(id, everyone)]);
    setEvent(found === null || found === 'not_found' ? found : found.item.event);
    setStudents(list);
    if (list) {
      setParts((current) => current ?? new Map(list.filter((s) => s.part).map((s) => [s.studentId, s.part as string])));
      setTicked((current) => current ?? new Set(list.filter((s) => s.attended).map((s) => s.studentId)));
    }
  }, [id, everyone]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (students ?? []).filter((s) => !q || s.fullName.toLowerCase().includes(q) || s.rollNo.toLowerCase().includes(q));
  }, [students, search]);

  const title = mode === 'performers' ? t('events.performers.title') : t('events.attendance.title');
  const header = <Stack.Screen options={{ title }} />;

  if (event === undefined || students === undefined || event === null || event === 'not_found' || students === null || !parts || !ticked) {
    return (
      <Screen underHeader centred>
        {header}
        {event === undefined || students === undefined ? <LoadingCards /> : null}
        {event === 'not_found' ? <Notice tone="info">{t('events.notFound')}</Notice> : null}
        {event === null || students === null ? (
          <>
            <Notice tone="error" title={t('events.loadFailed')}>
              {t('common.networkError')}
            </Notice>
            <Button icon="refresh" label={t('common.tryAgain')} onPress={() => void load()} />
          </>
        ) : null}
      </Screen>
    );
  }

  const byId = new Map(students.map((s) => [s.studentId, s]));
  const line = (s: EventStudent) =>
    [
      s.rollNo,
      levelName(t, s.levelId),
      s.response ? t(`events.responses.${s.response}`) : s.hasLogin ? t('events.detail.noAnswer') : t('events.performers.noApp'),
    ].join(' · ');

  async function save() {
    setSaving(true);
    setMessage(null);
    if (mode === 'performers') {
      const result = await savePerformers(id, [...(parts as Map<string, string>)].map(([studentId, part]) => ({ studentId, part })));
      setSaving(false);
      if (result.errorKey) setMessage({ tone: 'error', text: t(result.errorKey) });
      else setMessage({ tone: 'success', text: t('events.performers.saved', { n: result.notified ?? 0 }) });
    } else {
      const result = await saveAttendance(id, [...(ticked as Set<string>)]);
      setSaving(false);
      if (result.errorKey) setMessage({ tone: 'error', text: t(result.errorKey) });
      else setMessage({ tone: 'success', text: t('events.attendance.saved', { n: (ticked as Set<string>).size }) });
    }
  }

  const setPart = (studentId: string, part: string | null) => {
    setMessage(null);
    setParts((current) => {
      const next = new Map(current);
      if (part === null) next.delete(studentId);
      else next.set(studentId, part);
      return next;
    });
  };
  const toggle = (studentId: string) => {
    setMessage(null);
    setTicked((current) => {
      const next = new Set(current);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  };

  return (
    <Screen underHeader wide onRefresh={load}>
      {header}
      <AppText variant="title">{event.title}</AppText>
      <AppText tone="muted">{whenText(event)}</AppText>
      <AppText tone="muted">{mode === 'performers' ? t('events.performers.intro') : t('events.attendance.intro')}</AppText>

      {mode === 'performers' ? (
        <Section icon="performer" title={t('events.performers.chosen', { n: parts.size })}>
          {parts.size === 0 ? <AppText tone="muted">{t('events.performers.none')}</AppText> : null}
          {[...parts].map(([studentId, part]) => (
            <TextField
              key={studentId}
              label={byId.get(studentId)?.fullName ?? studentId}
              hint={t('events.performers.partHint', { max: PART_MAX })}
              value={part}
              onChangeText={(v) => setPart(studentId, v)}
              maxLength={PART_MAX}
            />
          ))}
          <AppText variant="label">{t('events.performers.partForNew')}</AppText>
          <ChoiceGroup
            chips
            choices={PARTS.map((p) => ({ value: t(`events.performers.parts.${p}`), label: t(`events.performers.parts.${p}`), icon: 'performer' as const }))}
            value={newPart}
            onChange={setNewPart}
          />
        </Section>
      ) : (
        <AppText variant="label">{t('events.attendance.count', { n: ticked.size })}</AppText>
      )}

      <TextField label={t('events.performers.search')} value={search} onChangeText={setSearch} />
      <Checkbox label={t('events.performers.everyone')} checked={everyone} onChange={setEveryone} />
      {shown.length === 0 ? <AppText tone="muted">{t('events.performers.noStudents')}</AppText> : null}
      {shown.map((s) =>
        mode === 'performers' ? (
          <ListRow
            key={s.studentId}
            leading="initials"
            title={s.fullName}
            highlighted={parts.has(s.studentId)}
            details={[line(s), ...(parts.has(s.studentId) ? [t('events.performers.asPart', { part: parts.get(s.studentId) })] : [])]}
            action={
              parts.has(s.studentId)
                ? { label: t('events.performers.remove'), variant: 'link', onPress: () => setPart(s.studentId, null) }
                : { label: t('events.performers.add'), variant: 'secondary', onPress: () => setPart(s.studentId, newPart) }
            }
          />
        ) : (
          <ListRow
            key={s.studentId}
            leading={ticked.has(s.studentId) ? 'attended' : 'initials'}
            title={s.fullName}
            highlighted={ticked.has(s.studentId)}
            details={[line(s), ticked.has(s.studentId) ? t('events.attendance.came') : t('events.attendance.notMarked')]}
            onPress={() => toggle(s.studentId)}
          />
        ),
      )}

      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      <Button label={t('events.performers.save')} loading={saving} onPress={() => void save()} />
      <Button variant="link" label={t('events.performers.back')} onPress={() => router.back()} />
    </Screen>
  );
}
