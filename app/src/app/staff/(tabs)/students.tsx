// C7 Student list, for coordinators and the Guru: every student with level, status and when
// they last came. Search by name or roll number; filter by level, status, mentor and days since
// the last visit. Tapping a student opens their profile (C8, ./[id].tsx).
// Data: student_overview (src/data/student-overview.ts). The whole list is loaded once and
// filtered on the phone, so the search answers as the coordinator types.

import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { ChoiceGroup, type Choice } from '@/components/choice-group';
import { Columns } from '@/components/columns';
import { EmptyState } from '@/components/empty-state';
import { ListRow } from '@/components/list-row';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { TextField } from '@/components/text-field';
import {
  ABSENT_DAY_CHOICES,
  countActiveFilters,
  fetchStaff,
  fetchStudentSummaries,
  filterStudents,
  NO_FILTERS,
  STUDENT_STATUSES,
  type StaffMember,
  type StudentFilters,
  type StudentSummary,
} from '@/data/student-overview';
import { lastVisitText, levelName, statusName } from '@/i18n/labels';
import { spacing, useWide } from '@/theme/use-theme';

/** What the screen loaded: the students and the staff, for mentor names. */
type Loaded = { students: StudentSummary[]; staff: StaffMember[] };

/** Search box, a filter panel that opens on request, the count, and one row per student. */
export default function StudentListScreen() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const myId = profile?.id ?? null;
  // undefined = loading, null = could not load.
  const [loaded, setLoaded] = useState<Loaded | null | undefined>(undefined);
  const [filters, setFilters] = useState<StudentFilters>(NO_FILTERS);
  // Closed at first: on a phone the filters would push the list off the screen.
  const [showFilters, setShowFilters] = useState(false);

  const load = useCallback(async () => {
    const [students, staff] = await Promise.all([fetchStudentSummaries(), fetchStaff()]);
    setLoaded(students && staff ? { students, staff } : null);
  }, []);

  // Reload whenever the screen comes back into view, e.g. after a call was logged on a profile.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const shown = useMemo(
    () => (loaded ? filterStudents(loaded.students, filters, myId) : []),
    [loaded, filters, myId],
  );

  const staffNames = useMemo(
    () => new Map((loaded?.staff ?? []).map((s) => [s.id, s.fullName])),
    [loaded],
  );

  const mentorChoices = useMemo((): Choice<string>[] => {
    const students = loaded?.students ?? [];
    const mentorIds = new Set(students.map((s) => s.mentorId).filter((id): id is string => id !== null));
    const choices: Choice<string>[] = [{ value: 'all', label: t('students.filters.all') }];
    // "My students" only for someone who mentors at least one student.
    if (myId && mentorIds.has(myId)) choices.push({ value: 'mine', label: t('students.filters.mine') });
    choices.push({ value: 'none', label: t('students.filters.noMentor') });
    // Only coordinators who mentor someone, so the row stays short.
    for (const member of loaded?.staff ?? []) {
      if (member.id !== myId && mentorIds.has(member.id)) choices.push({ value: member.id, label: member.fullName });
    }
    return choices;
  }, [loaded, myId, t]);

  const update = (change: Partial<StudentFilters>) => setFilters((current) => ({ ...current, ...change }));
  const activeFilters = countActiveFilters(filters);
  const header = <Stack.Screen options={{ title: t('students.title') }} />;
  // On a laptop the two buttons sit beside the search box, and the list goes two columns.
  const wide = useWide();

  if (loaded === null) {
    return (
      <Screen underHeader centred>
        {header}
        <Notice tone="error" title={t('students.loadFailed')}>
          {t('common.networkError')}
        </Notice>
        <Button icon="refresh" label={t('common.tryAgain')} onPress={() => void load()} />
      </Screen>
    );
  }

  const registerButton = (
    <Button
      variant="secondary"
      icon="register"
      label={t('staff.registerStudent')}
      onPress={() => router.push('/staff/register')}
    />
  );
  const searchField = (
    <TextField
      label={t('students.searchLabel')}
      hint={t('students.searchHint')}
      value={filters.search}
      onChangeText={(search) => update({ search })}
      autoCapitalize="none"
      autoCorrect={false}
      returnKeyType="search"
    />
  );
  const filterButton = (
    <Button
      variant="secondary"
      icon="filter"
      label={
        showFilters
          ? t('students.hideFilters')
          : activeFilters > 0
            ? t('students.showFiltersCount', { number: activeFilters })
            : t('students.showFilters')
      }
      onPress={() => setShowFilters(!showFilters)}
    />
  );

  return (
    <Screen underHeader wide onRefresh={load}>
      {header}
      {wide ? (
        <View style={styles.toolbar}>
          <View style={styles.search}>{searchField}</View>
          <View style={styles.toolbarButtons}>
            {registerButton}
            {filterButton}
          </View>
        </View>
      ) : (
        <>
          {registerButton}
          {searchField}
          {filterButton}
        </>
      )}

      {showFilters ? (
        <Section title={t('students.filters.title')}>
          <ChoiceGroup
            label={t('students.filters.level')}
            choices={[
              { value: 'all', label: t('students.filters.all') },
              ...[1, 2, 3].map((id) => ({ value: String(id), label: levelName(t, id) })),
            ]}
            value={String(filters.levelId)}
            onChange={(value) => update({ levelId: value === 'all' ? 'all' : Number(value) })}
          />
          <ChoiceGroup
            label={t('students.filters.status')}
            choices={[
              { value: 'all', label: t('students.filters.all') },
              ...STUDENT_STATUSES.map((status) => ({ value: status, label: statusName(t, status) })),
            ]}
            value={filters.status}
            onChange={(status) => update({ status })}
          />
          <ChoiceGroup
            label={t('students.filters.mentor')}
            choices={mentorChoices}
            value={filters.mentor}
            onChange={(mentor) => update({ mentor })}
          />
          <ChoiceGroup
            label={t('students.filters.absent')}
            choices={ABSENT_DAY_CHOICES.map((days) => ({
              value: days,
              label: days === 0 ? t('students.filters.anyTime') : t('students.filters.days', { days }),
            }))}
            value={filters.absentDays}
            onChange={(absentDays) => update({ absentDays })}
          />
          {activeFilters > 0 ? (
            <Button
              variant="link"
              label={t('students.clearFilters')}
              onPress={() => setFilters({ ...NO_FILTERS, search: filters.search })}
            />
          ) : null}
        </Section>
      ) : null}

      {loaded ? (
        <AppText variant="label" role="status">
          {t('students.count', { shown: shown.length, total: loaded.students.length })}
        </AppText>
      ) : (
        <LoadingCards />
      )}

      {loaded && shown.length === 0 ? <EmptyState icon="search" title={t('students.empty')} /> : null}
      <Columns>
        {shown.map((student) => (
          <ListRow
            key={student.id}
            leading="initials"
            title={student.fullName}
            highlighted={student.hereNow}
            chips={{ levelId: student.levelId, status: student.status }}
            details={[
              student.rollNo,
              lastVisitText(t, student),
              student.mentorId
                ? t('students.mentor', { name: staffNames.get(student.mentorId) ?? '' })
                : t('students.noMentor'),
            ]}
            onPress={() => router.push({ pathname: '/staff/students/[id]', params: { id: student.id } })}
          />
        ))}
      </Columns>
    </Screen>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.md,
  },
  search: {
    flex: 1,
  },
  toolbarButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
    // Level with the search box, whose label sits above it.
    paddingBottom: 2,
  },
});
