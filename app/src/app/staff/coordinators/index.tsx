// G2 Coordinators, the Guru only: the coordinators (and the Guru) with how many students they
// mentor and their duty hours; the people who signed up and wait for a role; logins put aside.
// A row opens the person's page (./[id].tsx), where roles, duty hours, mentees and switching off
// are handled. Opened from "Running the class" on the Guru home (components/admin-links.tsx).
// Data: src/data/coordinators.ts.

import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Columns } from '@/components/columns';
import { EmptyState } from '@/components/empty-state';
import { GuruOnly } from '@/components/guru-only';
import { ListRow } from '@/components/list-row';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { fetchCoordinatorsBoard, type CoordinatorsBoard, type Person } from '@/data/coordinators';
import { formatDateTime } from '@/lib/dates';

/** The coordinators list with the waiting people. */
export default function CoordinatorsScreen() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  // undefined = loading, null = could not load.
  const [board, setBoard] = useState<CoordinatorsBoard | null | undefined>(undefined);

  const load = useCallback(async () => {
    setBoard(await fetchCoordinatorsBoard());
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const menteeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of board?.students ?? []) {
      if (s.mentorId && s.status !== 'left') counts.set(s.mentorId, (counts.get(s.mentorId) ?? 0) + 1);
    }
    return counts;
  }, [board]);
  const noMentor = (board?.students ?? []).filter((s) => !s.mentorId && s.status !== 'left').length;

  if (profile?.role !== 'guru') return <GuruOnly title={t('coordinators.title')} />;

  const open = (person: Person) => router.push({ pathname: '/staff/coordinators/[id]', params: { id: person.id } });
  const staffRow = (person: Person) => (
    <ListRow
      key={person.id}
      leading="initials"
      title={person.fullName || person.email || t('home.guru.noName')}
      details={[
        [person.role === 'guru' ? t('roles.guru') : t('roles.coordinator'), person.active ? null : t('coordinators.switchedOff')]
          .filter(Boolean)
          .join(' · '),
        t('coordinators.mentees', { count: menteeCounts.get(person.id) ?? 0 }),
        person.dutyHours ? t('coordinators.dutyLine', { hours: person.dutyHours }) : t('coordinators.noDuty'),
      ]}
      onPress={() => open(person)}
    />
  );
  const waitingRow = (person: Person) => (
    <ListRow
      key={person.id}
      leading="person"
      title={person.fullName || t('home.guru.noName')}
      details={[person.email ?? '', t('coordinators.signedUp', { date: formatDateTime(person.createdAt) })]}
      onPress={() => open(person)}
    />
  );

  return (
    <Screen underHeader wide onRefresh={load}>
      <Stack.Screen options={{ title: t('coordinators.title') }} />
      <AppText tone="muted">{t('coordinators.intro')}</AppText>

      {board === undefined ? <LoadingCards /> : null}
      {board === null ? (
        <>
          <Notice tone="error" title={t('coordinators.loadFailed')}>
            {t('common.networkError')}
          </Notice>
          <Button icon="refresh" label={t('common.tryAgain')} onPress={() => void load()} />
        </>
      ) : null}

      {board ? (
        <>
          <AppText variant="subtitle">{t('coordinators.waitingTitle', { count: board.waiting.length })}</AppText>
          {board.waiting.length === 0 ? (
            <AppText tone="muted">{t('coordinators.waitingEmpty')}</AppText>
          ) : (
            <>
              <AppText tone="muted">{t('coordinators.waitingHelp')}</AppText>
              <Columns>{board.waiting.map(waitingRow)}</Columns>
            </>
          )}

          <AppText variant="subtitle">{t('coordinators.staffTitle', { count: board.staff.length })}</AppText>
          {noMentor > 0 ? <Notice tone="info">{t('coordinators.noMentorCount', { count: noMentor })}</Notice> : null}
          {board.staff.length === 0 ? <EmptyState icon="groups" title={t('coordinators.staffEmpty')} /> : null}
          <Columns>{board.staff.map(staffRow)}</Columns>

          {board.setAside.length > 0 ? (
            <>
              <AppText variant="subtitle">{t('coordinators.setAsideTitle', { count: board.setAside.length })}</AppText>
              <Columns>{board.setAside.map(waitingRow)}</Columns>
            </>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
