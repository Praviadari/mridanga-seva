// C1 Coordinator dashboard, the coordinator's home: who is here now (opens C6), today's visits
// (opens C5), follow-up calls due for my students (opens C10), and the new joiners of the last
// few weeks (settings.new_joiner_weeks; each opens their profile, C8), then the buttons to every
// staff screen, the language switch, Sign out and the app version. On the Android app, "A new
// version is ready" shows under the greeting once an update is downloaded
// (components/update-notice.tsx). Read-only. Numbers: coordinator_dashboard() through
// src/data/home.ts. It loads again each time it comes back into view, so the numbers follow what
// was just done.

import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { signOut } from '@/auth/auth-actions';
import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { LanguagePicker } from '@/components/language-picker';
import { ListRow } from '@/components/list-row';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { StaffShortcuts } from '@/components/staff-shortcuts';
import { StatGrid, StatTile } from '@/components/stat-tile';
import { UpdateNotice, VersionLine } from '@/components/update-notice';
import { fetchCoordinatorDashboard, type CoordinatorDashboard } from '@/data/home';
import { levelName } from '@/i18n/labels';
import { formatDayMonthYear } from '@/lib/dates';

/** Coordinator home screen. */
export default function CoordinatorHome() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const name = profile?.full_name.trim();
  // undefined = loading, null = could not load.
  const [board, setBoard] = useState<CoordinatorDashboard | null | undefined>(undefined);

  const load = useCallback(async () => {
    setBoard(await fetchCoordinatorDashboard());
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <Screen>
      <AppText variant="title">{name ? t('home.greeting', { name }) : t('home.greetingNoName')}</AppText>
      <AppText tone="muted">{t('home.role', { role: t('roles.coordinator') })}</AppText>
      <UpdateNotice />

      {board === undefined ? <AppText tone="muted">{t('common.loading')}</AppText> : null}
      {board === null ? (
        <>
          <Notice tone="error" title={t('home.loadFailed')}>
            {t('common.networkError')}
          </Notice>
          <Button variant="secondary" label={t('common.tryAgain')} onPress={() => void load()} />
        </>
      ) : null}

      {board ? (
        <>
          <StatGrid>
            <StatTile
              value={String(board.hereNow)}
              label={t('home.staff.hereNow')}
              onPress={() => router.push('/staff/here-now')}
            />
            <StatTile
              value={String(board.visitsToday)}
              label={t('home.staff.visitsToday')}
              onPress={() => router.push('/staff/attendance')}
            />
            <StatTile
              value={String(board.myCallsDue)}
              label={t('home.staff.myCallsDue')}
              onPress={() => router.push('/staff/follow-up')}
            />
            <StatTile
              value={String(board.newJoinerCount)}
              label={t('home.staff.newJoiners', { weeks: board.newJoinerWeeks })}
            />
          </StatGrid>

          <Section
            title={t('home.staff.newJoinersTitle', { weeks: board.newJoinerWeeks })}
            description={t('home.staff.newJoinersHint')}>
            {board.newJoiners.length === 0 ? (
              <AppText tone="muted">{t('home.staff.newJoinersEmpty', { weeks: board.newJoinerWeeks })}</AppText>
            ) : null}
            {board.newJoiners.map((j) => (
              <ListRow
                key={j.id}
                title={j.fullName}
                details={[
                  `${j.rollNo} · ${levelName(t, j.levelId)}`,
                  t('home.staff.joinedVisits', { date: formatDayMonthYear(j.joinedOn), count: j.visits }),
                ]}
                onPress={() => router.push({ pathname: '/staff/students/[id]', params: { id: j.id } })}
              />
            ))}
          </Section>
        </>
      ) : null}

      <StaffShortcuts />
      <LanguagePicker />
      <Button variant="link" label={t('common.signOut')} onPress={() => void signOut()} />
      <VersionLine />
    </Screen>
  );
}
