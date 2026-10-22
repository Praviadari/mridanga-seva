// Practice this week, per student (docs/DECISIONS.md #495; migration 0056 staff_practice_week), for coordinators and
// the Guru, from Practice tools: every student still in the class with this week's practice minutes and days against
// their goal, the last day they practised, and how their sessions went (#494); least practice first, so the
// follow-up calls start with those who may need a kind word. This week, last week or the week before. Filters: my
// students (mentees) and level. Each row opens the Student profile (C8). The list is the whole class's, as the
// Students tab (row-level security: staff read every student's practice; the caller's own record is left out).
// Nothing here is shown to students: no ranking between children leaves the staff screens.

import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { ChoiceGroup } from '@/components/choice-group';
import { Columns } from '@/components/columns';
import { EmptyState } from '@/components/empty-state';
import { ListRow } from '@/components/list-row';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { practiceTime } from '@/components/practice-parts';
import { RefreshFailed } from '@/components/refresh-failed';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { StatusText } from '@/components/status-text';
import { fetchStaffPracticeWeek, type StudentPracticeWeek } from '@/data/practice';
import type { StudentStatus } from '@/data/student-overview';
import { LEVEL_IDS, levelName } from '@/i18n/labels';
import { formatDate } from '@/lib/dates';
import { useKeptLoad } from '@/lib/kept-load';
import { weekGoalMet } from '@/lib/practice-goal';

/** The weeks offered: this week, last week, the week before. */
const WEEKS_AGO = [0, 1, 2] as const;

/** The staff list of practice this week. */
export default function PracticeWeekScreen() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const myId = profile?.id ?? null;
  const [weeksAgo, setWeeksAgo] = useState(0);
  const [who, setWho] = useState<'all' | 'mine'>('all');
  const [levelId, setLevelId] = useState<number | 'all'>('all');
  // undefined = loading, null = could not load.
  const [rows, setRows, refreshFailed] = useKeptLoad<StudentPracticeWeek[] | null | undefined>();

  const load = useCallback(async () => {
    setRows(await fetchStaffPracticeWeek(weeksAgo));
  }, [weeksAgo, setRows]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const mentorsSome = !!rows && rows.some((r) => r.mentorId === myId);
  const shown = useMemo(
    () => (rows ?? []).filter((r) => (who === 'all' || r.mentorId === myId) && (levelId === 'all' || r.levelId === levelId)),
    [rows, who, levelId, myId],
  );
  const none = shown.filter((r) => r.minutes === 0).length;

  const header = <Stack.Screen options={{ title: t('practiceExtras.weekTitle') }} />;

  if (rows === null) {
    return (
      <Screen underHeader centred>
        {header}
        <Notice tone="error" title={t('practiceExtras.weekLoadFailed')}>
          {t('common.networkError')}
        </Notice>
        <Button icon="refresh" label={t('common.tryAgain')} onPress={() => void load()} />
      </Screen>
    );
  }

  return (
    <Screen underHeader wide onRefresh={load}>
      <RefreshFailed at={refreshFailed} onRetry={() => load()} />
      {header}
      <AppText tone="muted">{t('practiceExtras.weekIntro')}</AppText>
      <Section title={t('practiceExtras.weekWhich')}>
        <ChoiceGroup<number>
          chips
          accessibilityLabel={t('practiceExtras.weekWhich')}
          value={weeksAgo}
          onChange={setWeeksAgo}
          choices={WEEKS_AGO.map((n) => ({
            value: n,
            label: n === 0 ? t('practiceExtras.weekThis') : n === 1 ? t('practiceExtras.weekLast') : t('practiceExtras.weekAgo', { count: n }),
          }))}
        />
        {mentorsSome ? (
          <ChoiceGroup<string>
            segmented
            label={t('students.filters.mentor')}
            value={who}
            onChange={(value) => setWho(value === 'mine' ? 'mine' : 'all')}
            choices={[
              { value: 'all', label: t('students.filters.all') },
              { value: 'mine', label: t('students.filters.mine') },
            ]}
          />
        ) : null}
        <ChoiceGroup<string>
          chips
          label={t('students.filters.level')}
          value={String(levelId)}
          onChange={(value) => setLevelId(value === 'all' ? 'all' : Number(value))}
          choices={[{ value: 'all', label: t('students.filters.all') }, ...LEVEL_IDS.map((id) => ({ value: String(id), label: levelName(t, id) }))]}
        />
      </Section>

      {rows === undefined ? <LoadingCards /> : null}
      {rows ? (
        <StatusText variant="label">
          {t('practiceExtras.weekCount', { count: shown.length, none, from: formatDate(rows[0]?.weekStart ?? '') })}
        </StatusText>
      ) : null}
      {rows && shown.length === 0 ? <EmptyState icon="students" title={t('practiceExtras.weekEmpty')} /> : null}
      <Columns>
        {shown.map((row) => {
          const met = weekGoalMet(row);
          const feelings = row.feelings.hard + row.feelings.okay + row.feelings.good;
          return (
            <ListRow
              key={row.studentId}
              leading="initials"
              title={row.fullName}
              chips={{ levelId: row.levelId, status: row.status === 'active' ? undefined : (row.status as StudentStatus) }}
              highlight={row.minutes === 0 ? 'attention' : met ? 'confirmed' : undefined}
              details={[
                row.minutes === 0
                  ? t('practiceExtras.weekNone')
                  : t('practiceExtras.weekPractised', { time: practiceTime(t, row.minutes), days: row.days, goal: row.goal.days }),
                ...(met ? [t('practiceExtras.weekGoalMet')] : []),
                row.lastOn ? t('practiceExtras.weekLastOn', { date: formatDate(row.lastOn) }) : t('practiceExtras.weekNever'),
                ...(feelings > 0 ? [t('practiceExtras.weekFeelings', { good: row.feelings.good, okay: row.feelings.okay, hard: row.feelings.hard })] : []),
              ]}
              onPress={() => router.push({ pathname: '/staff/students/[id]', params: { id: row.studentId } })}
            />
          );
        })}
      </Columns>
    </Screen>
  );
}
