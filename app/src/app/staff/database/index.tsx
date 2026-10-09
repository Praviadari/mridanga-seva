// G3 Students, whole database, the Guru only: every student record with search and filters
// (level, status, mentor, area), as a table on a laptop and as rows on a phone; a row opens the
// student's profile (C8). "Import from Excel or CSV" opens ./import.tsx. C7 stays the everyday
// list for coordinators. Data: src/data/student-database.ts.

import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { ChoiceGroup, type Choice } from '@/components/choice-group';
import { EmptyState } from '@/components/empty-state';
import { GuruOnly } from '@/components/guru-only';
import { ListRow } from '@/components/list-row';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { TextField } from '@/components/text-field';
import {
  areasOf,
  fetchStudentDatabase,
  filterDatabase,
  NO_DATABASE_FILTERS,
  type DatabaseFilters,
  type DatabaseRow,
} from '@/data/student-database';
import { fetchStaff, STUDENT_STATUSES, type StaffMember } from '@/data/student-overview';
import { LEVEL_IDS, levelName, statusName } from '@/i18n/labels';
import { formatDate } from '@/lib/dates';
import { spacing, useTheme, useWide } from '@/theme/use-theme';

/** Rows drawn at first; "Show more" adds this many again, so a long list stays quick. */
const PAGE = 100;

type Loaded = { rows: DatabaseRow[]; staff: StaffMember[] };

/** The whole database with filters. */
export default function StudentDatabaseScreen() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const { colors } = useTheme();
  const wide = useWide();
  // undefined = loading, null = could not load.
  const [loaded, setLoaded] = useState<Loaded | null | undefined>(undefined);
  const [filters, setFilters] = useState<DatabaseFilters>(NO_DATABASE_FILTERS);
  const [limit, setLimit] = useState(PAGE);

  const load = useCallback(async () => {
    const [rows, staff] = await Promise.all([fetchStudentDatabase(), fetchStaff()]);
    setLoaded(rows && staff ? { rows, staff } : null);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const shown = useMemo(() => (loaded ? filterDatabase(loaded.rows, filters) : []), [loaded, filters]);
  const staffNames = useMemo(() => new Map((loaded?.staff ?? []).map((s) => [s.id, s.fullName])), [loaded]);
  const areaChoices = useMemo((): Choice<string>[] => {
    const areas = areasOf(loaded?.rows ?? []);
    return [
      { value: 'all', label: t('students.filters.all') },
      ...areas.slice(0, 15).map((a) => ({ value: a.key, label: `${a.label || t('database.noArea')} (${a.count})` })),
    ];
  }, [loaded, t]);
  const mentorChoices = useMemo((): Choice<string>[] => {
    const used = new Set((loaded?.rows ?? []).map((r) => r.mentorId));
    return [
      { value: 'all', label: t('students.filters.all') },
      { value: 'none', label: t('students.filters.noMentor') },
      ...(loaded?.staff ?? []).filter((s) => used.has(s.id)).map((s) => ({ value: s.id, label: s.fullName })),
    ];
  }, [loaded, t]);

  if (profile?.role !== 'guru') return <GuruOnly title={t('database.title')} />;

  const update = (change: Partial<DatabaseFilters>) => {
    setLimit(PAGE);
    setFilters((current) => ({ ...current, ...change }));
  };
  const open = (row: DatabaseRow) => router.push({ pathname: '/staff/students/[id]', params: { id: row.id } });
  const mentorText = (row: DatabaseRow) => (row.mentorId ? (staffNames.get(row.mentorId) ?? '') : t('database.none'));
  const header = <Stack.Screen options={{ title: t('database.title') }} />;

  if (loaded === null) {
    return (
      <Screen underHeader centred>
        {header}
        <Notice tone="error" title={t('database.loadFailed')}>
          {t('common.networkError')}
        </Notice>
        <Button icon="refresh" label={t('common.tryAgain')} onPress={() => void load()} />
      </Screen>
    );
  }

  const cell = (text: string, flex: number, muted = false) => (
    <AppText variant="small" tone={muted ? 'muted' : 'default'} style={{ flex }} numberOfLines={1}>
      {text}
    </AppText>
  );

  return (
    <Screen underHeader wide onRefresh={load}>
      {header}
      <AppText tone="muted">{t('database.intro')}</AppText>
      <Button icon="add" label={t('database.import')} onPress={() => router.push('/staff/database/import')} />
      <TextField
        label={t('database.searchLabel')}
        value={filters.search}
        onChangeText={(search) => update({ search })}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Section title={t('students.filters.title')}>
        <ChoiceGroup
          chips
          label={t('students.filters.level')}
          choices={[
            { value: 'all', label: t('students.filters.all') },
            ...LEVEL_IDS.map((id) => ({ value: String(id), label: levelName(t, id) })),
          ]}
          value={String(filters.levelId)}
          onChange={(value) => update({ levelId: value === 'all' ? 'all' : Number(value) })}
        />
        <ChoiceGroup
          chips
          label={t('students.filters.status')}
          choices={[
            { value: 'all', label: t('students.filters.all') },
            ...STUDENT_STATUSES.map((status) => ({ value: status, label: statusName(t, status) })),
          ]}
          value={filters.status}
          onChange={(status) => update({ status })}
        />
        <ChoiceGroup chips label={t('students.filters.mentor')} choices={mentorChoices} value={filters.mentor} onChange={(mentor) => update({ mentor })} />
        <ChoiceGroup chips label={t('database.area')} choices={areaChoices} value={filters.area} onChange={(area) => update({ area })} />
        {JSON.stringify({ ...filters, search: '' }) !== JSON.stringify(NO_DATABASE_FILTERS) ? (
          <Button variant="link" label={t('students.clearFilters')} onPress={() => update({ ...NO_DATABASE_FILTERS, search: filters.search })} />
        ) : null}
      </Section>

      {loaded === undefined ? (
        <LoadingCards />
      ) : (
        <AppText variant="label" role="status">
          {t('students.count', { shown: shown.length, total: loaded.rows.length })}
        </AppText>
      )}
      {loaded && shown.length === 0 ? <EmptyState icon="search" title={t('students.empty')} /> : null}

      {wide && shown.length > 0 ? (
        <View style={[styles.table, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <View style={[styles.row, styles.headRow, { borderColor: colors.border }]}>
            {cell(t('database.columns.roll'), 1.2, true)}
            {cell(t('database.columns.name'), 2, true)}
            {cell(t('database.columns.level'), 1.1, true)}
            {cell(t('database.columns.status'), 1, true)}
            {cell(t('database.columns.mentor'), 1.4, true)}
            {cell(t('database.columns.area'), 1.2, true)}
            {cell(t('database.columns.phone'), 1.3, true)}
            {cell(t('database.columns.joined'), 1.1, true)}
            {cell(t('database.columns.app'), 0.6, true)}
          </View>
          {shown.slice(0, limit).map((row) => (
            <Pressable
              key={row.id}
              accessibilityRole="button"
              accessibilityLabel={`${row.fullName}, ${row.rollNo}`}
              onPress={() => open(row)}
              style={({ pressed, hovered }) => [
                styles.row,
                { borderColor: colors.border },
                (pressed || hovered) && { backgroundColor: colors.primarySoft },
              ]}>
              {cell(row.rollNo, 1.2)}
              {cell(row.fullName, 2)}
              {cell(levelName(t, row.levelId), 1.1)}
              {cell(statusName(t, row.status), 1)}
              {cell(mentorText(row), 1.4)}
              {cell(row.area ?? '', 1.2)}
              {cell(row.phone ?? '', 1.3)}
              {cell(formatDate(row.joinedOn), 1.1)}
              {cell(row.hasLogin ? t('database.yes') : '', 0.6)}
            </Pressable>
          ))}
        </View>
      ) : (
        shown.slice(0, limit).map((row) => (
          <ListRow
            key={row.id}
            leading="initials"
            title={row.fullName}
            chips={{ levelId: row.levelId, status: row.status }}
            details={[
              [row.rollNo, row.area].filter(Boolean).join(' · '),
              t('students.mentor', { name: mentorText(row) }),
              [row.phone, row.hasLogin ? t('database.hasLogin') : null].filter(Boolean).join(' · '),
            ].filter(Boolean)}
            onPress={() => open(row)}
          />
        ))
      )}
      {shown.length > limit ? (
        <Button variant="secondary" label={t('database.showMore', { count: shown.length - limit })} onPress={() => setLimit(limit + PAGE)} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  table: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    minHeight: 44,
  },
  headRow: {
    borderTopWidth: 0,
  },
});
