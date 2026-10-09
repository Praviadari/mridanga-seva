// C1 Coordinator dashboard, the coordinator's home: the saffron header, a big Mark attendance
// button (C5), who is here now (opens C6), today's visits (opens C5), follow-up calls due for my
// students (opens C10), and the new joiners of the last few weeks (settings.new_joiner_weeks;
// each opens their profile, C8), promotions (Phase 2: answers asked of me, my students ready to nominate), then the tiles to every staff screen, the language switch, Sign
// out and the app version. On the Android app, "A new
// version is ready" shows under the greeting once an update is downloaded
// (components/update-notice.tsx). Read-only. Numbers: coordinator_dashboard() through
// src/data/home.ts. It loads again each time it comes back into view, so the numbers follow what
// was just done.

import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-provider';
import { AccountFooter } from '@/components/account-footer';
import { MyReportsLink } from '@/components/admin-links';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { HomeHeader } from '@/components/home-header';
import { ListRow } from '@/components/list-row';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { PromotionHomeCard } from '@/components/promotion-parts';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { MarkAttendanceButton, StaffShortcuts } from '@/components/staff-shortcuts';
import { StatGrid, StatTile } from '@/components/stat-tile';
import { UpdateNotice } from '@/components/update-notice';
import { fetchCoordinatorDashboard, type CoordinatorDashboard } from '@/data/home';
import { formatDate } from '@/lib/dates';

/** Coordinator home screen, shown by the staff Home tab (app/staff/(tabs)/index.tsx). */
export function CoordinatorHome() {
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
    <Screen wide header={<HomeHeader name={name} role={t('roles.coordinator')} />} onRefresh={load}>
      <UpdateNotice />
      <MarkAttendanceButton />

      {board === undefined ? <LoadingCards kind="tiles" /> : null}
      {board === null ? (
        <>
          <Notice tone="error" title={t('home.loadFailed')}>
            {t('common.networkError')}
          </Notice>
          <Button variant="secondary" icon="refresh" label={t('common.tryAgain')} onPress={() => void load()} />
        </>
      ) : null}

      {board ? (
        <>
          <StatGrid>
            <StatTile
              icon="hereNow"
              value={String(board.hereNow)}
              label={t('home.staff.hereNow')}
              onPress={() => router.push('/staff/here-now')}
            />
            <StatTile
              icon="visits"
              value={String(board.visitsToday)}
              label={t('home.staff.visitsToday')}
              onPress={() => router.push('/staff/attendance')}
            />
            <StatTile
              icon="calls"
              value={String(board.myCallsDue)}
              label={t('home.staff.myCallsDue')}
              onPress={() => router.push({ pathname: '/staff/follow-up', params: { scope: 'mine' } })}
            />
            <StatTile
              icon="newJoiner"
              value={String(board.newJoinerCount)}
              label={t('home.staff.newJoiners', { count: board.newJoinerWeeks })}
            />
          </StatGrid>

          {/* Phase 2 (docs/DECISIONS.md #53): answers asked of me (C23), my students ready to nominate (C22). */}
          <PromotionHomeCard guru={false} />

          <Section
            icon="newJoiner"
            title={t('home.staff.newJoinersTitle', { count: board.newJoinerWeeks })}
            description={t('home.staff.newJoinersHint')}>
            {board.newJoiners.length === 0 ? (
              <EmptyState
                icon="newJoiner"
                title={t('home.staff.newJoinersEmpty', { count: board.newJoinerWeeks })}
              />
            ) : null}
            {board.newJoiners.map((j) => (
              <ListRow
                key={j.id}
                leading="initials"
                title={j.fullName}
                chips={{ levelId: j.levelId }}
                details={[
                  j.rollNo,
                  t('home.staff.joinedVisits', { date: formatDate(j.joinedOn), count: j.visits }),
                ]}
                onPress={() => router.push({ pathname: '/staff/students/[id]', params: { id: j.id } })}
              />
            ))}
          </Section>
        </>
      ) : null}

      <StaffShortcuts />
      {/* Round 9: C21 My reports. */}
      <MyReportsLink />
      <AccountFooter />
    </Screen>
  );
}
