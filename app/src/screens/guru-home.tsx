// G1 the facilitator's Home (role value 'guru', #40) since the ring homes (Praveen 30-10-2026, docs/DECISIONS.md
// #777-#779: every home a ring, no scrolling, the rest in the side menu; was the 11-module grid of #700-#703): the band
// with the menu button (components/side-menu.tsx, carrying the To do total) and the bell, then a ring of eight of the
// eleven modules (Teaching, Coordinators, Students, Events & Seva, Reports, Funds, Inventory, Admin;
// components/staff-shortcuts.tsx FacilitatorRing), each opening its landing screen, sized to the room above the tabs
// (components/home-ring.tsx), and the fact of the day while there is room. Media, Security & Audits and Settings are in
// the side menu, under its Today boxes (components/staff-today.tsx, which left the home). What waits is a red count on
// its circle (Level-ups, recordings and suggestions on Teaching; follow-ups on Coordinators; sign-ups on Students; fund
// entries on Funds) and one amber To do line while anything waits (ToDoLine, opening staff/waiting.tsx). Behind the
// modules: the numbers on Overview (GuruOverview below, staff/overview.tsx, in Reports) and the overdue and escalated
// follow-ups per coordinator (GuruFollowUps below, staff/follow-ups-by-coordinator.tsx, in Coordinators). Only
// notices stay: "A new version is ready", notifications off (#305), could not load. Numbers: staff_dashboard() through
// src/data/home.ts. It loads again each time it comes back into view.

import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { HomeHeader } from '@/components/home-header';
import { ListRow } from '@/components/list-row';
import { Notice } from '@/components/notice';
import { ProgressBar } from '@/components/progress-bar';
import { PromotionHomeCard } from '@/components/promotion-parts';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { FacilitatorRing } from '@/components/staff-shortcuts';
import { ToDoLine, waitingTotal } from '@/components/staff-today';
import { StatGrid, StatTile } from '@/components/stat-tile';
import { PrivacyNoticeCard } from '@/components/privacy-notice-card';
import { PushNotice } from '@/components/push-notice';
import { UpdateNotice } from '@/components/update-notice';
import { fetchStaffDashboard, type GuruDashboard, type StaffDashboard } from '@/data/home';
import { levelName, statusName } from '@/i18n/labels';
import { formatDate } from '@/lib/dates';
import { useReloadOnResume } from '@/lib/reload-on-resume';

/** Follow-ups overdue or escalated, over every coordinator. */
export function followUpsNeedingAttention(board: GuruDashboard): number {
  return board.followUps.reduce((total, f) => total + f.overdue + f.escalated, 0);
}

/** Guru home screen, shown by the staff Home tab (app/staff/(tabs)/index.tsx). */
export function GuruHome() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const name = profile?.full_name.trim();
  // undefined = loading, null = could not load.
  const [board, setBoard] = useState<StaffDashboard | null | undefined>(undefined);

  const load = useCallback(async () => {
    setBoard(await fetchStaffDashboard(true));
  }, []);

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
      header={<HomeHeader menu toDo={board ? waitingTotal(board) : undefined} name={name} role={t('roles.guru')} />}
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
      {/* The ring of eight filling the room above the tabs, the fact of the day under it while there is room (#777). */}
      <FacilitatorRing board={board} />
    </Screen>
  );
}

/**
 * The whole class at a glance (Overview, staff/overview.tsx): students who came this week, in
 * class (C7, not left), new joiners (staff/new-joiners.tsx), follow-ups to check (C10); the
 * level-up queue (G7); students per level and per status.
 */
export function GuruOverview({ board }: { board: GuruDashboard }) {
  const { t } = useTranslation();
  const everyone = board.byStatus.reduce((total, s) => total + s.students, 0);
  return (
    <>
      <StatGrid>
        <StatTile icon="visits" value={String(board.cameThisWeek)} label={t('home.guru.cameThisWeek')} />
        <StatTile
          icon="students"
          value={String(board.inClass)}
          label={t('home.guru.inClass')}
          onPress={() => router.push({ pathname: '/staff/class-list', params: { status: 'notLeft' } })}
        />
        <StatTile
          icon="newJoiner"
          value={String(board.newJoiners)}
          label={t('home.staff.newJoiners', { count: board.newJoinerWeeks })}
          onPress={() => router.push('/staff/new-joiners')}
        />
        <StatTile
          icon="calls"
          value={String(followUpsNeedingAttention(board))}
          label={t('home.guru.followUpsToCheck')}
          onPress={() => router.push('/staff/calls')}
        />
      </StatGrid>
      <AppText variant="small" tone="muted">
        {board.weekStarts === 'rolling7'
          ? t('weekMeaning.guruRolling', { date: formatDate(board.weekStart) })
          : t('home.guru.weekFrom', { date: formatDate(board.weekStart) })}
      </AppText>

      {/* Phase 2 (docs/DECISIONS.md #53): the level-up queue, G7. */}
      <PromotionHomeCard guru />

      <Section icon="level" title={t('home.guru.byLevel')} description={t('home.guru.byLevelHint')}>
        {board.byLevel.map((l) => (
          <ProgressBar
            key={l.levelId}
            done={l.students}
            total={board.inClass}
            showComplete={false}
            label={levelName(t, l.levelId, l.name)}
            valueText={t('home.guru.share', { name: levelName(t, l.levelId, l.name), count: l.students, total: board.inClass })}
          />
        ))}
      </Section>

      <Section icon="status" title={t('home.guru.byStatus')} description={t('home.guru.byStatusHint')}>
        {board.byStatus.map((s) => (
          <ProgressBar
            key={s.status}
            done={s.students}
            total={everyone}
            showComplete={false}
            label={statusName(t, s.status)}
            valueText={t('home.guru.share', { name: statusName(t, s.status), count: s.students, total: everyone })}
          />
        ))}
      </Section>
    </>
  );
}

/** Overdue and escalated follow-ups per coordinator, each opening C10 for that coordinator. */
export function GuruFollowUps({ board }: { board: GuruDashboard }) {
  const { t } = useTranslation();
  return (
    <Section icon="calls" title={t('home.guru.followUps')} description={t('home.guru.followUpsHint')}>
      {board.followUps.length === 0 ? <EmptyState icon="check" title={t('home.guru.followUpsEmpty')} /> : null}
      {board.followUps.map((f) => (
        <ListRow
          key={f.assigneeId ?? 'none'}
          leading={f.assigneeId === null ? 'alert' : 'initials'}
          // No assignee: the students had no mentor when their call task was made.
          title={f.assigneeId === null ? t('students.filters.noMentor') : f.fullName || t('home.guru.noName')}
          details={[t('home.guru.followUpLine', { overdue: f.overdue, escalated: f.escalated })]}
          onPress={() => router.push({ pathname: '/staff/calls', params: { assignee: f.assigneeId ?? 'none' } })}
        />
      ))}
      <Button variant="secondary" icon="calls" label={t('home.guru.openCalls')} onPress={() => router.push('/staff/calls')} />
    </Section>
  );
}
