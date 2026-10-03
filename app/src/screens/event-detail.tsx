// One event, for everyone (S11 students, C16 staff): the card with when, where, who it is for and
// who made it; Going / Maybe / Not going for those it is for, until it starts; Add to calendar;
// the counts. A student also sees their part (performer) and "You came". Staff also get the names
// by answer, Remind, Performers, Attendance (from the event day), and — the author or the Guru —
// Edit, Cancel (with a reason) and Delete (only while nobody answered).
// Routes: student/events/[id].tsx, staff/events/[id].tsx. Data: src/data/events.ts (0021).

import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking } from 'react-native';

import { useAuth } from '@/auth/auth-provider';
import { AnnouncementDetail } from '@/components/announcement-detail';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { ChoiceGroup } from '@/components/choice-group';
import { ListRow } from '@/components/list-row';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { StatGrid, StatTile } from '@/components/stat-tile';
import { TextField } from '@/components/text-field';
import {
  answerEvent,
  CANCEL_REASON_MAX,
  canRemind,
  cancelEvent,
  deleteEvent,
  fetchEvent,
  fetchEventPeople,
  hasStarted,
  isEventDay,
  isOver,
  placeText,
  remindEvent,
  RESPONSES,
  whenText,
  type EventItem,
  type EventNames,
  type EventPerson,
  type EventResponse,
} from '@/data/events';
import { audienceName } from '@/i18n/labels';
import { googleCalendarLink, shareCalendarFile } from '@/lib/calendar-file';

type Loaded = { item: EventItem; names: EventNames; people: EventPerson[] | null };

/** The event screen. `area` decides the extras; `id` comes from the route. */
export function EventDetailScreen({ id, area }: { id: number; area: 'student' | 'staff' }) {
  const { t } = useTranslation();
  const { profile, area: myArea } = useAuth();
  const myId = profile?.id ?? '';
  const isStaff = area === 'staff';
  const [loaded, setLoaded] = useState<Loaded | 'not_found' | null | undefined>(undefined);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [confirming, setConfirming] = useState<'cancel' | 'delete' | null>(null);
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    const found = await fetchEvent(id);
    if (found === null || found === 'not_found') {
      setLoaded(found);
      return;
    }
    const people = isStaff ? await fetchEventPeople(id) : null;
    setLoaded({ ...found, people });
  }, [id, isStaff]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const header = <Stack.Screen options={{ title: t('events.title') }} />;

  if (loaded === undefined || loaded === null || loaded === 'not_found') {
    return (
      <Screen underHeader centred>
        {header}
        {loaded === undefined ? <LoadingCards /> : null}
        {loaded === 'not_found' ? <Notice tone="info">{t('events.notFound')}</Notice> : null}
        {loaded === null ? (
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

  const { item, names, people } = loaded;
  const { event: e, counts } = item;
  const cancelled = e.cancelledAt !== null;
  const started = hasStarted(e);
  const over = isOver(e);
  const canChange = isStaff && (e.createdBy === myId || myArea === 'guru');
  const authorName = e.createdBy ? names.staff.get(e.createdBy) : undefined;
  const where = placeText(e, names);
  const noAnswer = Math.max(0, counts.addressed - counts.going - counts.maybe - counts.notGoing);
  const answered = counts.going + counts.maybe + counts.notGoing > 0;

  async function answer(response: EventResponse) {
    setBusy('answer');
    setMessage(null);
    const result = await answerEvent(e.id, response);
    setBusy(null);
    if (result.errorKey) setMessage({ tone: 'error', text: t(result.errorKey) });
    else await load();
  }

  async function addToCalendar(how: 'file' | 'google') {
    const cal = { id: e.id, title: e.title, description: e.description, location: where, startsAt: e.startsAt, endsAt: e.endsAt };
    if (how === 'google') {
      await Linking.openURL(googleCalendarLink(cal));
      return;
    }
    const result = await shareCalendarFile(cal, t('events.calendar.dialog'));
    if (result === 'failed') setMessage({ tone: 'error', text: t('events.calendar.failed') });
  }

  async function remind() {
    setBusy('remind');
    setMessage(null);
    const result = await remindEvent(e.id);
    setBusy(null);
    if (result.errorKey) setMessage({ tone: 'error', text: t(result.errorKey) });
    else {
      setMessage({ tone: 'success', text: t('events.detail.reminded', { n: result.reminded ?? 0 }) });
      await load();
    }
  }

  async function confirm() {
    setBusy(confirming);
    setMessage(null);
    const result = confirming === 'delete' ? await deleteEvent(e.id) : await cancelEvent(e.id, reason);
    setBusy(null);
    if (result.errorKey) {
      setMessage({ tone: 'error', text: t(result.errorKey) });
      return;
    }
    if (confirming === 'delete') {
      router.back();
      return;
    }
    setConfirming(null);
    setMessage({ tone: 'success', text: t('events.detail.cancelledDone') });
    await load();
  }

  const responseLabel = (r: EventResponse) => t(`events.responses.${r}`);
  const peopleBy = (r: EventResponse | null) => (people ?? []).filter((p) => p.response === r);

  return (
    <Screen underHeader onRefresh={load}>
      {header}
      {cancelled ? (
        <Notice tone="error" title={t('events.cancelled')}>
          {e.cancelReason ? t('events.detail.cancelReason', { reason: e.cancelReason }) : t('events.detail.cancelledBody')}
        </Notice>
      ) : null}

      <AnnouncementDetail
        title={e.title}
        body={e.description}
        pinned={false}
        attachments={[]}
        facts={[
          { icon: 'time', text: whenText(e) },
          ...(where ? [{ icon: 'location' as const, text: where }] : []),
          {
            icon: 'groups',
            text: audienceName(t, e, {
              groupName: e.audienceGroup !== null ? names.groups.get(e.audienceGroup) : null,
              authorName,
              byMe: e.createdBy === myId,
            }),
          },
          ...(authorName ? [{ icon: 'person' as const, text: t('events.detail.createdBy', { name: authorName }) }] : []),
        ]}
      />

      {counts.myPart ? (
        <Notice tone="success" title={t('events.detail.yourPart', { part: counts.myPart })}>
          {t('events.detail.yourPartBody')}
        </Notice>
      ) : null}
      {!isStaff && counts.iAttended ? <Notice tone="success">{t('events.detail.youCame')}</Notice> : null}

      {counts.canAnswer && !cancelled ? (
        <Section icon="check" title={t('events.detail.yourAnswer')}>
          {started ? (
            <AppText tone="muted">
              {counts.myResponse ? t('events.detail.answeredClosed', { answer: responseLabel(counts.myResponse) }) : t('events.detail.closed')}
            </AppText>
          ) : (
            <>
              <ChoiceGroup
                choices={RESPONSES.map((r) => ({ value: r, label: responseLabel(r) }))}
                value={counts.myResponse}
                onChange={(r) => void answer(r)}
              />
              <AppText tone="muted">{counts.myResponse ? t('events.detail.changeUntil') : t('events.detail.pleaseAnswer')}</AppText>
            </>
          )}
        </Section>
      ) : null}

      {!cancelled && !over ? (
        <Section icon="calendarAdd" title={t('events.calendar.title')}>
          <Button variant="secondary" icon="calendarAdd" label={t('events.calendar.file')} onPress={() => void addToCalendar('file')} />
          <Button variant="link" icon="open" label={t('events.calendar.google')} onPress={() => void addToCalendar('google')} />
        </Section>
      ) : null}

      <Section icon="groups" title={t('events.detail.answers')}>
        <StatGrid>
          <StatTile icon="check" value={String(counts.going)} label={t('events.responses.going')} />
          <StatTile icon="time" value={String(counts.maybe)} label={t('events.responses.maybe')} />
          <StatTile icon="cancel" value={String(counts.notGoing)} label={t('events.responses.not_going')} />
          <StatTile icon="bell" value={String(noAnswer)} label={t('events.detail.noAnswer')} />
        </StatGrid>
        {counts.performers > 0 ? <AppText tone="muted">{t('events.detail.performersCount', { n: counts.performers })}</AppText> : null}
        {counts.attended > 0 ? <AppText tone="muted">{t('events.detail.attendedCount', { n: counts.attended })}</AppText> : null}
        {isStaff && people === null ? <Notice tone="error">{t('events.detail.peopleFailed')}</Notice> : null}
        {isStaff && people
          ? ([...RESPONSES, null] as const).map((r) => {
              const list = peopleBy(r);
              if (list.length === 0) return null;
              return (
                <Section key={r ?? 'none'} title={`${r ? responseLabel(r) : t('events.detail.noAnswer')} (${list.length})`}>
                  {list.map((p) => (
                    <ListRow
                      key={p.profileId}
                      leading="initials"
                      title={p.fullName}
                      highlighted={r === 'going'}
                      details={[p.rollNo ?? t(`roles.${p.role}`)]}
                    />
                  ))}
                </Section>
              );
            })
          : null}
      </Section>

      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}

      {isStaff && !cancelled && !confirming ? (
        <>
          {!started ? (
            <Button
              variant="secondary"
              icon="bell"
              label={t('events.detail.remind')}
              disabled={!canRemind(e) || noAnswer === 0}
              loading={busy === 'remind'}
              onPress={() => void remind()}
            />
          ) : null}
          {!started && !canRemind(e) ? <AppText tone="muted">{t('events.detail.remindLater')}</AppText> : null}
          {!over ? (
            <Button
              variant="secondary"
              icon="performer"
              label={t('events.performers.open')}
              onPress={() => router.push({ pathname: '/staff/events/performers/[id]', params: { id: String(e.id) } })}
            />
          ) : null}
          {isEventDay(e) ? (
            <Button
              variant="secondary"
              icon="attended"
              label={t('events.attendance.open')}
              onPress={() => router.push({ pathname: '/staff/events/attendance/[id]', params: { id: String(e.id) } })}
            />
          ) : null}
          {canChange ? (
            <Button
              variant="secondary"
              icon="edit"
              label={t('events.detail.edit')}
              onPress={() => router.push({ pathname: '/staff/events/edit/[id]', params: { id: String(e.id) } })}
            />
          ) : null}
          {canChange && !over ? (
            <Button variant="link" icon="cancel" label={t('events.detail.cancel')} onPress={() => setConfirming('cancel')} />
          ) : null}
          {canChange && !answered && counts.performers === 0 && counts.attended === 0 ? (
            <Button variant="link" icon="delete" label={t('events.detail.delete')} onPress={() => setConfirming('delete')} />
          ) : null}
        </>
      ) : null}

      {confirming === 'cancel' ? (
        <>
          <Notice tone="info" title={t('events.detail.cancelTitle')}>
            {t('events.detail.cancelBody')}
          </Notice>
          <TextField
            label={t('events.detail.reason')}
            hint={t('events.detail.reasonHint', { max: CANCEL_REASON_MAX })}
            value={reason}
            onChangeText={setReason}
            maxLength={CANCEL_REASON_MAX}
          />
          <Button variant="secondary" label={t('events.detail.cancelYes')} loading={busy === 'cancel'} onPress={() => void confirm()} />
          <Button variant="link" label={t('events.detail.keep')} onPress={() => setConfirming(null)} />
        </>
      ) : null}
      {confirming === 'delete' ? (
        <>
          <Notice tone="info" title={t('events.detail.deleteTitle')}>
            {t('events.detail.deleteBody')}
          </Notice>
          <Button variant="secondary" label={t('events.detail.deleteYes')} loading={busy === 'delete'} onPress={() => void confirm()} />
          <Button variant="link" label={t('events.detail.keep')} onPress={() => setConfirming(null)} />
        </>
      ) : null}
    </Screen>
  );
}
