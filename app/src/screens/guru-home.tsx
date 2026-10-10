// G1 Guru home, simple since 10-10-2026 (docs/DECISIONS.md #240): the saffron header with the
// greeting, then only circles (components/staff-shortcuts.tsx): a ring of eight around the drum and
// two rows of four under it. What used to be cards here lives behind a circle: the numbers, students
// per level and per status on Overview (GuruOverview below, staff/overview.tsx), the overdue and
// escalated follow-ups per coordinator on Follow-ups (GuruFollowUps below,
// staff/follow-ups-by-coordinator.tsx), the level-up queue on G7, the admin screens on Running the
// class (staff/running-the-class.tsx). What waits for the Guru is a count on its circle: follow-ups
// overdue or escalated, nominations to decide. Only notices stay on the home: "A new version is
// ready" on the Android app, and could not load. Numbers: guru_dashboard() through src/data/home.ts.
// It loads again each time it comes back into view.

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
import { StaffModules } from '@/components/staff-shortcuts';
import { StatGrid, StatTile } from '@/components/stat-tile';
import { UpdateNotice } from '@/components/update-notice';
import { fetchGuruDashboard, type GuruDashboard } from '@/data/home';
import { fetchPromotionHome } from '@/data/promotion';
import { levelName, statusName } from '@/i18n/labels';
import { formatDate } from '@/lib/dates';

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
  const [board, setBoard] = useState<GuruDashboard | null | undefined>(undefined);
  const [toDecide, setToDecide] = useState(0);

  const load = useCallback(async () => {
    const [loaded, promotions] = await Promise.all([fetchGuruDashboard(), fetchPromotionHome()]);
    setBoard(loaded);
    setToDecide(promotions ? promotions.toDecide : 0);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <Screen wide header={<HomeHeader name={name} role={t('roles.guru')} />} onRefresh={load}>
      <UpdateNotice />
      {board === null ? (
        <>
          <Notice tone="error" title={t('home.loadFailed')}>
            {t('common.networkError')}
          </Notice>
          <Button variant="secondary" icon="refresh" label={t('common.tryAgain')} onPress={() => void load()} />
        </>
      ) : null}
      <StaffModules guru callsDue={board ? followUpsNeedingAttention(board) : 0} promotionsWaiting={toDecide} />
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
          onPress={() => router.push({ pathname: '/staff/students', params: { status: 'notLeft' } })}
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
          onPress={() => router.push('/staff/follow-up')}
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
          onPress={() => router.push({ pathname: '/staff/follow-up', params: { assignee: f.assigneeId ?? 'none' } })}
        />
      ))}
      <Button variant="secondary" icon="calls" label={t('home.guru.openCalls')} onPress={() => router.push('/staff/follow-up')} />
    </Section>
  );
}
