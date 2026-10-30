// C1 Coordinator home since the launch UI (14-10-2026, docs/DECISIONS.md #350-#353; was the simple home #240) and the
// ring homes (Praveen 30-10-2026, #777-#779): the band with the menu button (components/side-menu.tsx, carrying the
// To do total), then a ring of eight filled circles (components/staff-shortcuts.tsx) sized to the room above the tabs
// (components/home-ring.tsx), so the home never scrolls, and the fact of the day while there is room. The Today boxes
// (components/staff-today.tsx) left the home for the top of the side menu (#778). Behind the circles and the menu: the
// numbers on Overview (CoordinatorOverview below, staff/overview.tsx), the newcomers (NewJoinersList below,
// staff/new-joiners.tsx), level-ups on C22/C23. What waits is a red count on its circle (sign-ups on Welcome desk,
// recordings on Assessments) and one amber To do line while anything waits (ToDoLine, opening staff/waiting.tsx).
// Check-in, Students, Follow-ups and News are the tabs. Only notices stay: app update, notifications off (#305), could
// not load. Numbers: staff_dashboard() (one request) through src/data/home.ts. It loads again each time it comes back
// into view.

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
import { ToDoLine, waitingTotal } from '@/components/staff-today';
import { StatGrid, StatTile } from '@/components/stat-tile';
import { PrivacyNoticeCard } from '@/components/privacy-notice-card';
import { PushNotice } from '@/components/push-notice';
import { UpdateNotice } from '@/components/update-notice';
import { fetchStaffDashboard, type CoordinatorDashboard, type StaffDashboard } from '@/data/home';
import { hasOwnRecord } from '@/data/my-student';
import { formatDate } from '@/lib/dates';
import { useReloadOnResume } from '@/lib/reload-on-resume';

/** Coordinator home screen, shown by the staff Home tab (app/staff/(tabs)/index.tsx). */
export function CoordinatorHome() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const name = profile?.full_name.trim();
  // undefined = loading, null = could not load.
  const [board, setBoard] = useState<StaffDashboard | null | undefined>(undefined);
  const myId = profile?.id ?? '';

  const load = useCallback(async () => {
    // The own student record (0053) is still read here: it keeps the My QR card saved on the phone for Me, which is
    // in the side menu since #780.
    const [loaded] = await Promise.all([fetchStaffDashboard(false), hasOwnRecord(myId)]);
    setBoard(loaded);
  }, [myId]);

  // F9 / R4-04 (#327): back after a while (a phone that slept), the screen loads again.
  useReloadOnResume(load);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <Screen
      wide
      compact
      header={<HomeHeader menu toDo={board ? waitingTotal(board) : undefined} name={name} role={t('roles.coordinator')} />}
      onRefresh={load}>
      <UpdateNotice />
      <PushNotice place="home" />
      <PrivacyNoticeCard />
      {board === null ? (
        <>
          <Notice tone="error" title={t('home.loadFailed')}>
            {t('common.networkError')}
          </Notice>
          <Button variant="secondary" icon="refresh" label={t('common.tryAgain')} onPress={() => void load()} />
        </>
      ) : null}
      <ToDoLine board={board} />
      {/* The ring filling the room above the tabs, the fact of the day under it while there is room (#777). */}
      <StaffModules board={board} />
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
        <StatTile icon="visits" value={String(board.visitsToday)} label={t('home.staff.visitsToday')} onPress={() => router.push('/staff/mark-attendance')} />
        <StatTile
          icon="calls"
          value={String(board.myCallsDue)}
          label={t('home.staff.myCallsDue')}
          onPress={() => router.push({ pathname: '/staff/calls', params: { scope: 'mine' } })}
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
          // A light row: the name and one line; level and roll number are on the profile (UI audit fix 5, #365).
          details={[t('home.staff.joinedVisits', { date: formatDate(j.joinedOn), count: j.visits })]}
          onPress={() => router.push({ pathname: '/staff/students/[id]', params: { id: j.id } })}
        />
      ))}
    </Section>
  );
}
