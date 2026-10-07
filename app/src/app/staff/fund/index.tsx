// The class fund ledger (Phase 2 slice 9, docs/DECISIONS.md #80), for the Guru and every
// coordinator (students never come here: the staff layout sends them back). The balance, what
// waits for the signed-in person's approval, the entries of a period (this month, 3 months, this
// financial year from 1 April, all) with the balance after each, the monthly summary, and the CSV
// export like the reports (C21/G8). The Guru and treasurers add entries (./[id].tsx); the Guru
// keeps the categories (./categories.tsx). Opened from the "Class fund" row of the staff homes.
// Data: data/fund.ts; migration 0026_fund.sql.

import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { ChoiceGroup } from '@/components/choice-group';
import { Columns } from '@/components/columns';
import { DataTable } from '@/components/data-table';
import { EmptyState } from '@/components/empty-state';
import { ListRow } from '@/components/list-row';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { StatGrid, StatTile } from '@/components/stat-tile';
import {
  categoryName,
  fetchFundBook,
  formatMonth,
  formatRupees,
  fundCsvRows,
  fundFileName,
  monthlySummary,
  periodStart,
  waitingForMe,
  type FundBook,
  type FundEntry,
  type Period,
} from '@/data/fund';
import { toCsv } from '@/lib/csv';
import { formatDate, todayLocal } from '@/lib/dates';
import { CSV_WAYS, downloadCsv, saveCsvToFolder, shareCsv, type CsvResult } from '@/lib/save-csv';
import { spacing, useWide } from '@/theme/use-theme';

type Kind = 'all' | 'income' | 'expense' | 'waiting';

/** The ledger. */
export default function FundScreen() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const wide = useWide();
  const [book, setBook] = useState<FundBook | null | undefined>(undefined);
  const [period, setPeriod] = useState<Period>('month');
  const [kind, setKind] = useState<Kind>('all');
  const [exportMessage, setExportMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    setBook(await fetchFundBook(profile?.id ?? null, profile?.role === 'guru'));
  }, [profile?.id, profile?.role]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const header = <Stack.Screen options={{ title: t('fund.title') }} />;
  if (book === undefined || book === null) {
    return (
      <Screen underHeader centred>
        {header}
        {book === undefined ? <LoadingCards /> : null}
        {book === null ? (
          <>
            <Notice tone="error" title={t('fund.loadFailed')}>
              {t('common.networkError')}
            </Notice>
            <Button icon="refresh" label={t('common.tryAgain')} onPress={() => void load()} />
          </>
        ) : null}
      </Screen>
    );
  }

  const today = todayLocal();
  const from = periodStart(period, today);
  const inPeriod = book.entries.filter((e) => from === null || e.onDate >= from);
  const shown = inPeriod.filter((e) =>
    kind === 'all' ? true : kind === 'waiting' ? e.status === 'waiting' : e.direction === kind,
  );
  const sum = (direction: 'income' | 'expense') =>
    inPeriod.filter((e) => e.status === 'approved' && e.direction === direction).reduce((total, e) => total + e.amountPaise, 0);
  const mine = waitingForMe(book);
  const waitingCount = book.entries.filter((e) => e.status === 'waiting').length;
  const category = new Map(book.categories.map((c) => [c.id, c]));
  const months = monthlySummary(book.entries).slice(0, 12);
  const open = (id: number) => router.push({ pathname: '/staff/fund/[id]', params: { id: String(id) } });

  const kindLine = (e: FundEntry) =>
    e.reversesId ? t('fund.reversalOf', { id: e.reversesId }) : t(`fund.directions.${e.direction}`);
  const statusText = (e: FundEntry) => (e.status === 'approved' ? '' : t(`fund.statuses.${e.status}`));
  const amountText = (e: FundEntry) => formatRupees(e.direction === 'income' ? e.amountPaise : -e.amountPaise, true);

  async function exportCsv(way: 'download' | 'folder' | 'share') {
    if (!book) return;
    const text = toCsv(fundCsvRows(book, inPeriod, t, formatDate));
    const name = fundFileName(from, today);
    const result: CsvResult =
      way === 'folder' ? await saveCsvToFolder(name, text) : way === 'share' ? await shareCsv(name, text) : await downloadCsv(name, text);
    if (result === 'saved') setExportMessage({ tone: 'success', text: t(way === 'share' ? 'reports.shared' : 'reports.saved', { name }) });
    else if (result === 'failed') setExportMessage({ tone: 'error', text: t('reports.exportFailed') });
  }

  return (
    <Screen underHeader wide onRefresh={load}>
      {header}
      <Notice tone="info">
        {book.isKeeper
          ? t('fund.introKeeper', { approval: formatRupees(book.approvalLimitPaise), bill: formatRupees(book.billLimitPaise) })
          : t('fund.introReader')}
      </Notice>

      <StatGrid>
        <StatTile icon="fund" value={formatRupees(book.balancePaise)} label={t('fund.balance')} />
        <StatTile icon="income" value={formatRupees(sum('income'))} label={t('fund.incomeIn', { period: t(`fund.periods.${period}`) })} />
        <StatTile icon="expense" value={formatRupees(sum('expense'))} label={t('fund.expenseIn', { period: t(`fund.periods.${period}`) })} />
        <StatTile icon="time" value={String(waitingCount)} label={t('fund.waitingCount')} onPress={() => setKind('waiting')} />
      </StatGrid>

      {mine.length > 0 ? (
        <Section icon="check" title={t('fund.forYouTitle', { count: mine.length })} description={t('fund.forYouHint')}>
          {mine.map((e) => (
            <ListRow
              key={e.id}
              leading={e.direction}
              highlighted
              title={`${amountText(e)} · ${categoryName(t, category.get(e.categoryId))}`}
              details={[[formatDate(e.onDate), kindLine(e), e.createdByName].join(' · '), e.note ?? ''].filter(Boolean)}
              onPress={() => open(e.id)}
            />
          ))}
        </Section>
      ) : null}

      {book.isKeeper || book.isGuru ? (
        <View style={styles.row}>
          {book.isKeeper ? (
            <Button icon="add" label={t('fund.add')} onPress={() => router.push({ pathname: '/staff/fund/[id]', params: { id: 'new' } })} />
          ) : null}
          {book.isGuru ? (
            <Button variant="secondary" icon="filter" label={t('fund.categoriesTitle')} onPress={() => router.push('/staff/fund/categories')} />
          ) : null}
        </View>
      ) : null}

      <ChoiceGroup<Period>
        chips
        label={t('fund.period')}
        choices={(['month', 'quarter', 'year', 'all'] as const).map((p) => ({ value: p, label: t(`fund.periods.${p}`) }))}
        value={period}
        onChange={setPeriod}
      />
      <ChoiceGroup<Kind>
        chips
        label={t('fund.show')}
        choices={(['all', 'income', 'expense', 'waiting'] as const).map((k) => ({ value: k, label: t(`fund.kinds.${k}`) }))}
        value={kind}
        onChange={setKind}
      />

      {shown.length === 0 ? (
        <EmptyState icon="fund" title={book.entries.length === 0 ? t('fund.empty') : t('fund.noneHere')} />
      ) : wide ? (
        <DataTable
          columns={[
            { label: t('fund.csv.date'), flex: 1 },
            { label: t('fund.csv.category'), flex: 1.6 },
            { label: t('fund.csv.party'), flex: 1.4 },
            { label: t('fund.csv.status'), flex: 1 },
            { label: t('fund.csv.amount'), flex: 1, align: 'right' },
            { label: t('fund.csv.balance'), flex: 1, align: 'right' },
          ]}
          rows={shown.map((e) => ({
            key: String(e.id),
            onPress: () => open(e.id),
            cells: [
              formatDate(e.onDate),
              `${categoryName(t, category.get(e.categoryId))}${e.reversesId ? ` (${t('fund.reversal')})` : ''}`,
              e.party ?? '',
              statusText(e) || t('fund.statuses.approved'),
              amountText(e),
              e.balanceAfterPaise === null ? '' : formatRupees(e.balanceAfterPaise),
            ],
          }))}
        />
      ) : (
        <Columns>
          {shown.map((e) => (
            <ListRow
              key={e.id}
              leading={e.direction}
              highlighted={e.status === 'waiting'}
              title={`${amountText(e)} · ${categoryName(t, category.get(e.categoryId))}`}
              details={[
                [formatDate(e.onDate), kindLine(e), statusText(e)].filter(Boolean).join(' · '),
                ...(e.party ? [e.party] : []),
                ...(e.balanceAfterPaise !== null ? [t('fund.balanceAfter', { amount: formatRupees(e.balanceAfterPaise) })] : []),
              ]}
              onPress={() => open(e.id)}
            />
          ))}
        </Columns>
      )}

      {months.length > 0 ? (
        <Section icon="report" title={t('fund.monthlyTitle')} description={t('fund.monthlyHint')}>
          {wide ? (
            <DataTable
              columns={[
                { label: t('fund.csv.month'), flex: 1 },
                { label: t('fund.csv.income'), flex: 1, align: 'right' },
                { label: t('fund.csv.expense'), flex: 1, align: 'right' },
                { label: t('fund.csv.net'), flex: 1, align: 'right' },
                { label: t('fund.csv.closing'), flex: 1, align: 'right' },
              ]}
              rows={months.map((m) => ({
                key: m.month,
                cells: [formatMonth(m.month), formatRupees(m.incomePaise), formatRupees(m.expensePaise), formatRupees(m.netPaise, true), formatRupees(m.closingPaise)],
              }))}
            />
          ) : (
            months.map((m) => (
              <View key={m.month} style={styles.month}>
                <AppText variant="label">{formatMonth(m.month)}</AppText>
                <AppText variant="small" tone="muted">
                  {t('fund.monthLine', {
                    income: formatRupees(m.incomePaise),
                    expense: formatRupees(m.expensePaise),
                    closing: formatRupees(m.closingPaise),
                  })}
                </AppText>
              </View>
            ))
          )}
        </Section>
      ) : null}

      <Section icon="download" title={t('fund.exportTitle')} description={t('fund.exportHint', { period: t(`fund.periods.${period}`) })}>
        {exportMessage ? <Notice tone={exportMessage.tone}>{exportMessage.text}</Notice> : null}
        <View style={styles.row}>
          {CSV_WAYS.includes('download') ? (
            <Button icon="download" label={t('reports.download')} onPress={() => void exportCsv('download')} />
          ) : null}
          {CSV_WAYS.includes('folder') ? (
            <Button icon="download" label={t('reports.saveToFolder')} onPress={() => void exportCsv('folder')} />
          ) : null}
          {CSV_WAYS.includes('share') ? (
            <Button variant="secondary" icon="share" label={t('reports.share')} onPress={() => void exportCsv('share')} />
          ) : null}
        </View>
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    alignItems: 'center',
  },
  month: {
    gap: 2,
    paddingVertical: spacing.xs,
  },
});
