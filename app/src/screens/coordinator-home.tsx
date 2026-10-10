// C1 Coordinator home, simple since 10-10-2026 (docs/DECISIONS.md #240): the saffron header with the
// greeting, then only circles (components/staff-shortcuts.tsx): a ring of nine around the drum and
// two rows of four under it. What used to be cards here lives behind a circle: the numbers on
// Overview (CoordinatorOverview below, staff/overview.tsx), the new joiners on New joiners
// (NewJoinersList below, staff/new-joiners.tsx), promotions on C22/C23. What waits for the
// coordinator is a count on its circle: calls due for my students, feedback asked of me. Only
// notices stay on the home: "A new version is ready" on the Android app, and could not load.
// Mark attendance, Students, Calls and Announcements are the bottom tabs. Numbers:
// coordinator_dashboard() through src/data/home.ts. It loads again each time it comes back into view.

import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { HomeHeader } from '@/components/home-header';
import { ListRow } from '@/components/list-row';
import { Notice } from '@/components/notice';
import { PromotionHomeCard } from '@/components/promotion-parts';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { StaffModules } from '@/components/staff-shortcuts';
import { StatGrid, StatTile } from '@/components/stat-tile';
import { UpdateNotice } from '@/components/update-notice';
import { fetchCoordinatorDashboard, type CoordinatorDashboard } from '@/data/home';
import { fetchPromotionHome } from '@/data/promotion';
import { formatDate } from '@/lib/dates';

/** Coordinator home screen, shown by the staff Home tab (app/staff/(tabs)/index.tsx). */
export function CoordinatorHome() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const name = profile?.full_name.trim();
  // undefined = loading, null = could not load.
  const [board, setBoard] = useState<CoordinatorDashboard | null | undefined>(undefined);
  const [toAnswer, setToAnswer] = useState(0);

  const load = useCallback(async () => {
    const [loaded, promotions] = await Promise.all([fetchCoordinatorDashboard(), fetchPromotionHome()]);
    setBoard(loaded);
    setToAnswer(promotions ? promotions.toAnswer : 0);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <Screen wide header={<HomeHeader name={name} role={t('roles.coordinator')} />} onRefresh={load}>
      <UpdateNotice />
      {board === null ? (
        <>
          <Notice tone="error" title={t('home.loadFailed')}>
            {t('common.networkError')}
          </Notice>
          <Button variant="secondary" icon="refresh" label={t('common.tryAgain')} onPress={() => void load()} />
        </>
      ) : null}
      <StaffModules guru={false} callsDue={board ? board.myCallsDue : 0} promotionsWaiting={toAnswer} />
    </Screen>
  );
}

/**
 * The coordinator's numbers (Overview, staff/overview.tsx): here now (C6), today's visits (C5),
 * calls due for my students (C10, mine), new joiners (staff/new-joiners.tsx), and promotions.
 */
export function CoordinatorOverview({ board }: { board: CoordinatorDashboard }) {
  const { t } = useTranslation();
  return (
    <>
      <StatGrid>
        <StatTile icon="hereNow" value={String(board.hereNow)} label={t('home.staff.hereNow')} onPress={() => router.push('/staff/here-now')} />
        <StatTile icon="visits" value={String(board.visitsToday)} label={t('home.staff.visitsToday')} onPress={() => router.push('/staff/attendance')} />
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
          onPress={() => router.push('/staff/new-joiners')}
        />
      </StatGrid>
      {/* Phase 2 (docs/DECISIONS.md #53): answers asked of me (C23), my students ready to nominate (C22). */}
      <PromotionHomeCard guru={false} />
    </>
  );
}

/** The new joiners of the last few weeks (settings.new_joiner_weeks), each opening C8. */
export function NewJoinersList({ board }: { board: CoordinatorDashboard }) {
  const { t } = useTranslation();
  return (
    <Section
      icon="newJoiner"
      title={t('home.staff.newJoinersTitle', { count: board.newJoinerWeeks })}
      description={t('home.staff.newJoinersHint')}>
      {board.newJoiners.length === 0 ? (
        <EmptyState icon="newJoiner" title={t('home.staff.newJoinersEmpty', { count: board.newJoinerWeeks })} />
      ) : null}
      {board.newJoiners.map((j) => (
        <ListRow
          key={j.id}
          leading="initials"
          title={j.fullName}
          chips={{ levelId: j.levelId }}
          details={[j.rollNo, t('home.staff.joinedVisits', { date: formatDate(j.joinedOn), count: j.visits })]}
          onPress={() => router.push({ pathname: '/staff/students/[id]', params: { id: j.id } })}
        />
      ))}
    </Section>
  );
}
