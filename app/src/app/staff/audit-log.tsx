// G11 Audit log, the Guru only, read-only: who changed what, and when, newest first; filters by
// record type, person, kind of change and period; a row opens to show the values before and after.
// 50 rows at a time with "Show older". Data: src/data/audit-log.ts.

import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { ChoiceGroup, type Choice } from '@/components/choice-group';
import { EmptyState } from '@/components/empty-state';
import { GuruOnly } from '@/components/guru-only';
import { Icon } from '@/components/icon';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import {
  AUDIT_PAGE,
  AUDITED_TABLES,
  changesOf,
  fetchAuditNames,
  fetchAuditPage,
  NO_AUDIT_FILTERS,
  subjectOf,
  type AuditEntry,
  type AuditFilters,
  type AuditNames,
} from '@/data/audit-log';
import { fetchStaff, type StaffMember } from '@/data/student-overview';
import { formatDateTimeInIndia } from '@/lib/dates';
import { cardLook, spacing, useTheme } from '@/theme/use-theme';

type Loaded = { entries: AuditEntry[]; names: AuditNames; staff: StaffMember[]; more: boolean };

/** The audit log with filters. */
export default function AuditLogScreen() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const { colors } = useTheme();
  // undefined = loading, null = could not load.
  const [loaded, setLoaded] = useState<Loaded | null | undefined>(undefined);
  const [filters, setFilters] = useState<AuditFilters>(NO_AUDIT_FILTERS);
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async (f: AuditFilters) => {
    const [entries, names, staff] = await Promise.all([fetchAuditPage(f, null), fetchAuditNames(), fetchStaff()]);
    setLoaded(entries && names && staff ? { entries, names, staff, more: entries.length === AUDIT_PAGE } : null);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load(filters);
      // Only on coming into view; a filter change loads by itself (change() below).
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load]),
  );

  if (profile?.role !== 'guru') return <GuruOnly title={t('auditLog.title')} />;

  function change(next: Partial<AuditFilters>) {
    const merged = { ...filters, ...next };
    setFilters(merged);
    setLoaded(undefined);
    void load(merged);
  }

  async function more() {
    if (!loaded) return;
    setLoadingMore(true);
    const older = await fetchAuditPage(filters, loaded.entries[loaded.entries.length - 1]?.id ?? null);
    setLoadingMore(false);
    if (older) setLoaded({ ...loaded, entries: [...loaded.entries, ...older], more: older.length === AUDIT_PAGE });
  }

  const tableChoices: Choice<string>[] = [
    { value: 'all', label: t('students.filters.all') },
    ...AUDITED_TABLES.map((table) => ({ value: table, label: t(`auditLog.tables.${table}`) })),
  ];
  const personChoices: Choice<string>[] = [
    { value: 'all', label: t('auditLog.anyone') },
    ...(loaded?.staff ?? []).map((s) => ({ value: s.id, label: s.fullName })),
  ];
  const who = (entry: AuditEntry, names: AuditNames) =>
    entry.changedBy === null ? t('auditLog.system') : names.people.get(entry.changedBy) || t('home.guru.noName');

  return (
    <Screen underHeader wide onRefresh={() => load(filters)}>
      <Stack.Screen options={{ title: t('auditLog.title') }} />
      <AppText tone="muted">{t('auditLog.intro')}</AppText>
      <Section icon="filter" title={t('students.filters.title')}>
        <ChoiceGroup chips label={t('auditLog.what')} choices={tableChoices} value={filters.table} onChange={(table) => change({ table: table as AuditFilters['table'] })} />
        <ChoiceGroup chips label={t('auditLog.who')} choices={personChoices} value={filters.person} onChange={(person) => change({ person })} />
        <ChoiceGroup
          chips
          label={t('auditLog.kind')}
          choices={[
            { value: 'all', label: t('students.filters.all') },
            { value: 'INSERT', label: t('auditLog.actions.INSERT') },
            { value: 'UPDATE', label: t('auditLog.actions.UPDATE') },
            { value: 'DELETE', label: t('auditLog.actions.DELETE') },
          ]}
          value={filters.action}
          onChange={(action) => change({ action: action as AuditFilters['action'] })}
        />
        <ChoiceGroup<number>
          chips
          label={t('auditLog.when')}
          choices={[
            { value: 0, label: t('auditLog.anyTime') },
            { value: 1, label: t('auditLog.lastDay') },
            { value: 7, label: t('auditLog.lastDays', { count: 7 }) },
            { value: 30, label: t('auditLog.lastDays', { count: 30 }) },
          ]}
          value={filters.days}
          onChange={(days) => change({ days: days as AuditFilters['days'] })}
        />
      </Section>

      {loaded === undefined ? <LoadingCards /> : null}
      {loaded === null ? (
        <>
          <Notice tone="error" title={t('auditLog.loadFailed')}>
            {t('common.networkError')}
          </Notice>
          <Button icon="refresh" label={t('common.tryAgain')} onPress={() => void load(filters)} />
        </>
      ) : null}
      {loaded && loaded.entries.length === 0 ? <EmptyState icon="search" title={t('auditLog.empty')} /> : null}

      {loaded
        ? loaded.entries.map((entry) => {
            const expanded = open.has(entry.id);
            const changes = expanded ? changesOf(entry) : [];
            return (
              <Pressable
                key={entry.id}
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                onPress={() =>
                  setOpen((current) => {
                    const next = new Set(current);
                    if (expanded) next.delete(entry.id);
                    else next.add(entry.id);
                    return next;
                  })
                }
                style={[cardLook(colors), styles.entry]}>
                <View style={styles.headLine}>
                  <View style={styles.headText}>
                    <AppText variant="label">
                      {t(`auditLog.actions.${entry.action}`)} · {t(`auditLog.tables.${entry.table as 'students'}`, { defaultValue: entry.table })}
                    </AppText>
                    <AppText variant="small">{subjectOf(entry, loaded.names) || entry.rowId}</AppText>
                    <AppText variant="small" tone="muted">
                      {t('auditLog.byLine', { who: who(entry, loaded.names), when: formatDateTimeInIndia(entry.changedAt) })}
                    </AppText>
                  </View>
                  <Icon name={expanded ? 'up' : 'down'} size={18} color={colors.textMuted} />
                </View>
                {expanded ? (
                  <View style={[styles.changes, { borderColor: colors.border }]}>
                    {changes.length === 0 ? <AppText variant="small" tone="muted">{t('auditLog.noChanges')}</AppText> : null}
                    {changes.map((c) => (
                      <View key={c.field} style={styles.change}>
                        <AppText variant="small" tone="muted">
                          {c.field}
                        </AppText>
                        <AppText variant="small">
                          {entry.action === 'UPDATE'
                            ? t('auditLog.fromTo', { before: c.before || '—', after: c.after || '—' })
                            : c.after || c.before}
                        </AppText>
                      </View>
                    ))}
                  </View>
                ) : null}
              </Pressable>
            );
          })
        : null}
      {loaded?.more ? (
        <Button variant="secondary" label={t('auditLog.older')} loading={loadingMore} onPress={() => void more()} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  entry: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  headLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  headText: {
    flex: 1,
    gap: 2,
  },
  changes: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  change: {
    gap: 2,
  },
});
