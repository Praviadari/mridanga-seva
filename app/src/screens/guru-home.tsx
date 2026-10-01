// G1 Guru dashboard, the Guru's home: the whole class at a glance, under the saffron header and a
// big Mark attendance button (C5). Students who came this week, students in class, new joiners,
// follow-ups needing attention (opens C10); students per level and per status; overdue and
// escalated follow-ups per coordinator; then the tiles to every staff screen, the language
// switch, Sign out and the app version. On the Android app, "A new version is
// ready" shows under the greeting once an update is downloaded (components/update-notice.tsx).
// Read-only. Numbers: guru_dashboard() through src/data/home.ts. It loads again each time it comes
// back into view.

import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-provider';
import { AccountFooter } from '@/components/account-footer';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { HomeHeader } from '@/components/home-header';
import { ListRow } from '@/components/list-row';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { ProgressBar } from '@/components/progress-bar';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { MarkAttendanceButton, StaffShortcuts } from '@/components/staff-shortcuts';
import { StatGrid, StatTile } from '@/components/stat-tile';
import { UpdateNotice } from '@/components/update-notice';
import { fetchGuruDashboard, type GuruDashboard } from '@/data/home';
import { levelName, statusName } from '@/i18n/labels';
import { formatDayMonthYear } from '@/lib/dates';

/** Guru home screen, shown by the staff Home tab (app/staff/(tabs)/index.tsx). */
export function GuruHome() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const name = profile?.full_name.trim();
  // undefined = loading, null = could not load.
  const [board, setBoard] = useState<GuruDashboard | null | undefined>(undefined);

  const load = useCallback(async () => {
    setBoard(await fetchGuruDashboard());
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const everyone = board ? board.byStatus.reduce((total, s) => total + s.students, 0) : 0;
  const needAttention = board ? board.followUps.reduce((total, f) => total + f.overdue + f.escalated, 0) : 0;

  return (
    <Screen wide header={<HomeHeader name={name} role={t('roles.guru')} />}>
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
            <StatTile icon="visits" value={String(board.cameThisWeek)} label={t('home.guru.cameThisWeek')} />
            <StatTile
              icon="students"
              value={String(board.inClass)}
              label={t('home.guru.inClass')}
              onPress={() => router.push('/staff/students')}
            />
            <StatTile
              icon="newJoiner"
              value={String(board.newJoiners)}
              label={t('home.staff.newJoiners', { weeks: board.newJoinerWeeks })}
            />
            <StatTile
              icon="calls"
              value={String(needAttention)}
              label={t('home.guru.followUpsToCheck')}
              onPress={() => router.push('/staff/follow-up')}
            />
          </StatGrid>
          <AppText variant="small" tone="muted">
            {t('home.guru.weekFrom', { date: formatDayMonthYear(board.weekStart) })}
          </AppText>

          <Section icon="level" title={t('home.guru.byLevel')} description={t('home.guru.byLevelHint')}>
            {board.byLevel.map((l) => (
              <ProgressBar
                key={l.levelId}
                done={l.students}
                total={board.inClass}
                showComplete={false}
                label={levelName(t, l.levelId, l.name)}
                valueText={t('home.guru.share', {
                  name: levelName(t, l.levelId, l.name),
                  count: l.students,
                  total: board.inClass,
                })}
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

          <Section icon="calls" title={t('home.guru.followUps')} description={t('home.guru.followUpsHint')}>
            {board.followUps.length === 0 ? <EmptyState icon="check" title={t('home.guru.followUpsEmpty')} /> : null}
            {board.followUps.map((f) => (
              <ListRow
                key={f.assigneeId ?? 'none'}
                leading={f.assigneeId === null ? 'alert' : 'initials'}
                // No assignee: the students had no mentor when their call task was made.
                title={f.assigneeId === null ? t('students.filters.noMentor') : f.fullName || t('home.guru.noName')}
                details={[t('home.guru.followUpLine', { overdue: f.overdue, escalated: f.escalated })]}
                onPress={() => router.push('/staff/follow-up')}
              />
            ))}
          </Section>
        </>
      ) : null}

      <StaffShortcuts />
      <AccountFooter />
    </Screen>
  );
}
