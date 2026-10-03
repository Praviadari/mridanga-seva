// G2, one person, the Guru only. For a coordinator (or the Guru): email and phone, duty hours,
// the students they mentor with "move the picked students to another coordinator", and switch off
// or on (a coordinator who still mentors students must hand them over first). For someone waiting
// for a role: make them a coordinator, or link them to their student record (for a student whose
// email on the record differs from the login's), or put the login aside. Changes ask first.
// Data: src/data/coordinators.ts; rules: migration 0014 (docs/DECISIONS.md #45).

import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Checkbox } from '@/components/checkbox';
import { ChoiceGroup } from '@/components/choice-group';
import { DetailGrid } from '@/components/detail-grid';
import { GuruOnly } from '@/components/guru-only';
import { ListRow } from '@/components/list-row';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { PersonHeader } from '@/components/person-header';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { TextField } from '@/components/text-field';
import {
  fetchPerson,
  linkToStudent,
  makeCoordinator,
  moveMentees,
  saveDutyHours,
  setActive,
  type CoordinatorsBoard,
  type MenteeRow,
  type Person,
} from '@/data/coordinators';
import { levelName, statusName } from '@/i18n/labels';
import { formatDateTimeInIndia } from '@/lib/dates';

type Loaded = { person: Person; board: CoordinatorsBoard };
/** What the page is asking to confirm. */
type Asking = 'coordinator' | 'off' | 'on' | { link: MenteeRow } | null;

/** One person's page. */
export default function PersonScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  // undefined = loading, null = could not load.
  const [loaded, setLoaded] = useState<Loaded | 'not_found' | null | undefined>(undefined);
  const [duty, setDuty] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [asking, setAsking] = useState<Asking>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    const result = await fetchPerson(id);
    setLoaded(result);
    if (result && result !== 'not_found') setDuty(result.person.dutyHours ?? '');
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const mentees = useMemo(
    () => (loaded && loaded !== 'not_found' ? loaded.board.students.filter((s) => s.mentorId === id) : []),
    [loaded, id],
  );
  const unlinked = useMemo(() => {
    if (!loaded || loaded === 'not_found') return [];
    const query = search.trim().toLowerCase();
    if (query.length < 2) return [];
    return loaded.board.students
      .filter((s) => !s.hasLogin && (s.fullName.toLowerCase().includes(query) || s.rollNo.toLowerCase().includes(query)))
      .slice(0, 8);
  }, [loaded, search]);

  if (profile?.role !== 'guru') return <GuruOnly title={t('coordinators.title')} />;

  const header = <Stack.Screen options={{ title: t('coordinators.personTitle') }} />;
  if (loaded === undefined) {
    return (
      <Screen underHeader>
        {header}
        <LoadingCards />
      </Screen>
    );
  }
  if (loaded === null || loaded === 'not_found') {
    return (
      <Screen underHeader centred>
        {header}
        <Notice tone="error" title={loaded === null ? t('coordinators.loadFailed') : t('coordinators.notFound')}>
          {loaded === null ? t('common.networkError') : undefined}
        </Notice>
        {loaded === null ? <Button icon="refresh" label={t('common.tryAgain')} onPress={() => void load()} /> : null}
      </Screen>
    );
  }

  const { person, board } = loaded;
  const isStaff = person.role === 'guru' || person.role === 'coordinator';
  const isMe = person.id === profile.id;
  const others = board.staff.filter((s) => s.active && s.id !== person.id);

  /** Runs a change, shows its result and loads the page again. */
  async function run(change: () => Promise<{ errorKey?: string }>, done: string) {
    setBusy(true);
    setMessage(null);
    const result = await change();
    setBusy(false);
    setAsking(null);
    if (result.errorKey) {
      setMessage({ tone: 'error', text: t(result.errorKey as never) });
      return;
    }
    setMessage({ tone: 'success', text: done });
    setPicked(new Set());
    await load();
  }

  async function move() {
    if (!target) return;
    const ids = [...picked];
    const targetName = board.staff.find((s) => s.id === target)?.fullName ?? '';
    setBusy(true);
    setMessage(null);
    const result = await moveMentees(ids, target);
    setBusy(false);
    if (result.errorKey) {
      setMessage({ tone: 'error', text: t(result.errorKey) });
      return;
    }
    setMessage({ tone: 'success', text: t('coordinators.moved', { count: result.moved ?? 0, name: targetName }) });
    setPicked(new Set());
    setTarget(null);
    await load();
  }

  const togglePick = (studentId: string, on: boolean) =>
    setPicked((current) => {
      const next = new Set(current);
      if (on) next.add(studentId);
      else next.delete(studentId);
      return next;
    });

  return (
    <Screen underHeader onRefresh={load}>
      {header}
      <PersonHeader
        name={person.fullName || t('home.guru.noName')}
        details={[
          person.role === 'guru'
            ? t('roles.guru')
            : person.role === 'coordinator'
              ? t('roles.coordinator')
              : t('coordinators.waitingRole'),
          person.active ? '' : t('coordinators.switchedOff'),
        ].filter(Boolean)}
      />
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}

      <DetailGrid
        details={[
          { label: t('coordinators.email'), value: person.email ?? '—' },
          { label: t('coordinators.phone'), value: person.phone ?? '—' },
          { label: t('coordinators.signedUpLabel'), value: formatDateTimeInIndia(person.createdAt) },
        ]}
      />

      {isStaff ? (
        <>
          <Section icon="time" title={t('coordinators.dutyTitle')} description={t('coordinators.dutyHint')}>
            <TextField
              label={t('coordinators.dutyLabel')}
              value={duty}
              onChangeText={setDuty}
              maxLength={120}
              placeholder={t('coordinators.dutyPlaceholder')}
            />
            <Button
              variant="secondary"
              label={t('coordinators.saveDuty')}
              loading={busy}
              disabled={duty.trim() === (person.dutyHours ?? '')}
              onPress={() => void run(() => saveDutyHours(person.id, duty), t('coordinators.dutySaved'))}
            />
          </Section>

          <Section
            icon="students"
            title={t('coordinators.menteesTitle', { count: mentees.length })}
            description={t('coordinators.menteesHint')}>
            {mentees.length === 0 ? <AppText tone="muted">{t('coordinators.menteesEmpty')}</AppText> : null}
            {mentees.length > 1 ? (
              <Button
                variant="link"
                label={picked.size === mentees.length ? t('coordinators.pickNone') : t('coordinators.pickAll')}
                onPress={() => setPicked(picked.size === mentees.length ? new Set() : new Set(mentees.map((m) => m.id)))}
              />
            ) : null}
            {mentees.map((m) => (
              <Checkbox
                key={m.id}
                label={`${m.fullName} · ${m.rollNo} · ${levelName(t, m.levelId)} · ${statusName(t, m.status)}`}
                checked={picked.has(m.id)}
                onChange={(on) => togglePick(m.id, on)}
              />
            ))}
            {picked.size > 0 ? (
              others.length === 0 ? (
                <Notice tone="info">{t('coordinators.noOtherStaff')}</Notice>
              ) : (
                <>
                  <ChoiceGroup
                    chips
                    label={t('coordinators.moveTo')}
                    choices={others.map((s) => ({ value: s.id, label: s.fullName || s.email || '' }))}
                    value={target}
                    onChange={setTarget}
                  />
                  <Button
                    icon="send"
                    label={t('coordinators.moveButton', { count: picked.size })}
                    loading={busy}
                    disabled={!target}
                    onPress={() => void move()}
                  />
                </>
              )
            ) : null}
          </Section>
        </>
      ) : null}

      {person.role === 'pending' && person.active ? (
        <Section icon="person" title={t('coordinators.giveRoleTitle')} description={t('coordinators.giveRoleHint')}>
          {asking === 'coordinator' ? (
            <Notice tone="info" title={t('coordinators.makeCoordinatorAsk', { name: person.fullName || person.email })}>
              {t('coordinators.makeCoordinatorBody')}
            </Notice>
          ) : null}
          {asking === 'coordinator' ? (
            <>
              <Button
                label={t('coordinators.makeCoordinator')}
                loading={busy}
                onPress={() => void run(() => makeCoordinator(person.id), t('coordinators.madeCoordinator'))}
              />
              <Button variant="link" label={t('syllabusEditor.cancel')} onPress={() => setAsking(null)} />
            </>
          ) : asking === null ? (
            <Button variant="secondary" icon="groups" label={t('coordinators.makeCoordinator')} onPress={() => setAsking('coordinator')} />
          ) : null}

          <AppText variant="label">{t('coordinators.linkTitle')}</AppText>
          <AppText tone="muted">{t('coordinators.linkHint')}</AppText>
          <TextField
            label={t('coordinators.linkSearch')}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {search.trim().length >= 2 && unlinked.length === 0 ? (
            <AppText tone="muted">{t('coordinators.linkNone')}</AppText>
          ) : null}
          {typeof asking === 'object' && asking !== null ? (
            <>
              <Notice tone="info" title={t('coordinators.linkAsk', { student: asking.link.fullName, roll: asking.link.rollNo })}>
                {t('coordinators.linkAskBody', { person: person.email ?? person.fullName })}
              </Notice>
              <Button
                label={t('coordinators.linkButton')}
                loading={busy}
                onPress={() => void run(() => linkToStudent(person.id, asking.link.id), t('coordinators.linked'))}
              />
              <Button variant="link" label={t('syllabusEditor.cancel')} onPress={() => setAsking(null)} />
            </>
          ) : (
            unlinked.map((s) => (
              <ListRow
                key={s.id}
                title={s.fullName}
                details={[`${s.rollNo} · ${levelName(t, s.levelId)} · ${statusName(t, s.status)}`]}
                action={{ label: t('coordinators.linkChoose'), variant: 'secondary', onPress: () => setAsking({ link: s }) }}
              />
            ))
          )}
        </Section>
      ) : null}

      {!isMe && person.role !== 'guru' ? (
        <Section
          icon="signOut"
          title={person.active ? t('coordinators.switchOffTitle') : t('coordinators.switchOnTitle')}
          description={person.active ? t('coordinators.switchOffHint') : t('coordinators.switchOnHint')}>
          {person.active && isStaff && mentees.length > 0 ? (
            <Notice tone="info">{t('coordinators.handOverFirst', { count: mentees.length })}</Notice>
          ) : asking === 'off' || asking === 'on' ? (
            <>
              <Notice tone={asking === 'off' ? 'error' : 'info'} title={asking === 'off' ? t('coordinators.switchOffAsk') : t('coordinators.switchOnAsk')}>
                {asking === 'off' ? t('coordinators.switchOffBody') : t('coordinators.switchOnBody')}
              </Notice>
              <Button
                label={asking === 'off' ? t('coordinators.switchOff') : t('coordinators.switchOn')}
                loading={busy}
                onPress={() =>
                  void run(
                    () => setActive(person.id, asking === 'on'),
                    asking === 'off' ? t('coordinators.switchedOffDone') : t('coordinators.switchedOnDone'),
                  )
                }
              />
              <Button variant="link" label={t('syllabusEditor.cancel')} onPress={() => setAsking(null)} />
            </>
          ) : asking === null ? (
            <Button
              variant="secondary"
              icon={person.active ? 'retire' : 'restore'}
              label={person.active ? t('coordinators.switchOff') : t('coordinators.switchOn')}
              onPress={() => setAsking(person.active ? 'off' : 'on')}
            />
          ) : null}
        </Section>
      ) : null}
      {person.role === 'guru' ? <AppText tone="muted">{t('coordinators.guruNote')}</AppText> : null}
    </Screen>
  );
}
