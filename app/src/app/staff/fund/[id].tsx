// One fund entry (Phase 2 slice 9, docs/DECISIONS.md #80). `id` = 'new': the Guru or a treasurer
// records an income or expense (kind, category, date, amount in rupees, from / to whom, a
// reference such as a UPI number or temple receipt, a note, the bill as a photo or PDF; a bill is
// needed over the bill limit, and an expense over the approval limit waits). Otherwise the entry
// with everything about it: who recorded and decided it, the bill, its reversal. Whoever may
// decide (the Guru; a treasurer for the Guru's own; never the maker) approves or declines it with
// a reason; the maker withdraws their own waiting entry; a keeper reverses an approved one with a
// reason (a counter-entry: entries are never deleted). Data: data/fund.ts; migration 0026.

import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import type { ParseKeys } from 'i18next';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { ChoiceGroup } from '@/components/choice-group';
import { DetailGrid } from '@/components/detail-grid';
import { EmptyState } from '@/components/empty-state';
import { ListRow } from '@/components/list-row';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { TextField } from '@/components/text-field';
import {
  canDecide,
  categoryName,
  checkEntryForm,
  decideEntry,
  fetchFundBook,
  formatRupees,
  NOTE_MAX,
  openBill,
  PARTY_MAX,
  parseRupees,
  pickBill,
  recordEntry,
  REFERENCE_MAX,
  reverseEntry,
  withdrawEntry,
  type Direction,
  type EntryForm,
  type EntryFormErrors,
  type FundBook,
} from '@/data/fund';
import { fileSizeText } from '@/i18n/labels';
import { formatDateTimeInIndia, formatDayMonthYear, parseDayMonthYear, todayInIndia } from '@/lib/dates';
import { spacing } from '@/theme/use-theme';

type Mode = 'decline' | 'withdraw' | 'reverse' | null;

/** One entry, or the form for a new one. */
export default function FundEntryScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ id: string }>();
  const isNew = params.id === 'new';
  const { profile } = useAuth();
  const [book, setBook] = useState<FundBook | null | undefined>(undefined);
  const [form, setForm] = useState<EntryForm>({
    direction: 'income',
    categoryId: null,
    date: formatDayMonthYear(todayInIndia()),
    amount: '',
    party: '',
    reference: '',
    note: '',
    bill: null,
  });
  const [errors, setErrors] = useState<EntryFormErrors>({});
  const [mode, setMode] = useState<Mode>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);

  const load = useCallback(async () => {
    setBook(await fetchFundBook(profile?.id ?? null, profile?.role === 'guru'));
  }, [profile?.id, profile?.role]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const entry = book && !isNew ? book.entries.find((e) => e.id === Number(params.id)) : undefined;
  const header = <Stack.Screen options={{ title: isNew ? t('fund.add') : t('fund.entryTitle', { id: params.id }) }} />;

  if (book === undefined || book === null || (!isNew && !entry) || (isNew && !book.isKeeper)) {
    return (
      <Screen underHeader centred>
        {header}
        {book === undefined ? <LoadingCards /> : null}
        {book === null ? (
          <Notice tone="error" title={t('fund.loadFailed')}>
            {t('common.networkError')}
          </Notice>
        ) : null}
        {book && isNew && !book.isKeeper ? <Notice tone="info">{t('fund.keeperOnly')}</Notice> : null}
        {book && !isNew && !entry ? <EmptyState icon="fund" title={t('fund.notFound')} /> : null}
      </Screen>
    );
  }

  const category = new Map(book.categories.map((c) => [c.id, c]));

  async function run(action: () => Promise<{ errorKey?: ParseKeys }>, done: string) {
    setBusy(true);
    setMessage(null);
    const outcome = await action();
    setBusy(false);
    if (outcome.errorKey) {
      setMessage({ tone: 'error', text: t(outcome.errorKey) });
      return;
    }
    setMessage({ tone: 'success', text: done });
    setMode(null);
    setNote('');
    await load();
  }

  // ---------------------------------------------------------------- the form
  if (isNew) {
    const update = (patch: Partial<EntryForm>) => setForm((current) => ({ ...current, ...patch }));
    const paise = parseRupees(form.amount);
    const choices = book.categories.filter((c) => c.direction === form.direction && !c.retired);
    const needsBill = form.direction === 'expense' && paise !== null && paise > book.billLimitPaise;
    const willWait = form.direction === 'expense' && paise !== null && paise > book.approvalLimitPaise;

    async function choose(kind: 'image' | 'pdf') {
      const picked = await pickBill(kind);
      if (picked.errorKey) setMessage({ tone: 'error', text: t(picked.errorKey) });
      if (picked.files[0]) {
        update({ bill: picked.files[0] });
        setErrors((current) => ({ ...current, bill: undefined }));
      }
    }

    async function save() {
      const today = todayInIndia();
      const isoDate = parseDayMonthYear(form.date);
      const problems = checkEntryForm(form, isoDate, today, book?.billLimitPaise ?? 0);
      setErrors(problems);
      if (Object.keys(problems).length > 0 || !isoDate || !profile) {
        setMessage({ tone: 'error', text: t('fund.fixFirst') });
        return;
      }
      setBusy(true);
      setMessage(null);
      const outcome = await recordEntry(profile.id, form, isoDate);
      setBusy(false);
      if (outcome.errorKey) setMessage({ tone: 'error', text: t(outcome.errorKey) });
      else if (outcome.id) router.replace({ pathname: '/staff/fund/[id]', params: { id: String(outcome.id) } });
    }

    return (
      <Screen underHeader>
        {header}
        <Section icon="fund" title={t('fund.add')} description={t('fund.addHint')}>
          <ChoiceGroup<Direction>
            label={t('fund.kindLabel')}
            choices={(['income', 'expense'] as const).map((d) => ({ value: d, label: t(`fund.directions.${d}`) }))}
            value={form.direction}
            onChange={(direction) => update({ direction, categoryId: null })}
          />
          <ChoiceGroup<number>
            chips
            label={t('fund.categoryLabel')}
            choices={choices.map((c) => ({ value: c.id, label: categoryName(t, c) }))}
            value={form.categoryId}
            onChange={(categoryId) => update({ categoryId })}
            error={errors.category ? t(errors.category) : undefined}
          />
          <TextField
            label={t('fund.amountLabel')}
            hint={t('fund.amountHint')}
            value={form.amount}
            onChangeText={(amount) => update({ amount })}
            keyboardType="decimal-pad"
            maxLength={14}
            error={errors.amount ? t(errors.amount) : undefined}
          />
          {paise !== null ? <AppText variant="small" tone="muted">{formatRupees(paise)}</AppText> : null}
          <TextField
            label={t('fund.dateLabel')}
            hint={t('fund.dateHint')}
            value={form.date}
            onChangeText={(date) => update({ date })}
            keyboardType="numbers-and-punctuation"
            maxLength={10}
            error={errors.date ? t(errors.date) : undefined}
          />
          <TextField
            label={form.direction === 'income' ? t('fund.fromLabel') : t('fund.toLabel')}
            value={form.party}
            onChangeText={(party) => update({ party })}
            maxLength={PARTY_MAX + 10}
            error={errors.party ? t(errors.party) : undefined}
          />
          <TextField
            label={t('fund.referenceLabel')}
            hint={t('fund.referenceHint')}
            value={form.reference}
            onChangeText={(reference) => update({ reference })}
            maxLength={REFERENCE_MAX + 10}
            error={errors.reference ? t(errors.reference) : undefined}
          />
          <TextField
            label={t('fund.noteLabel')}
            value={form.note}
            onChangeText={(text) => update({ note: text })}
            multiline
            maxLength={NOTE_MAX + 20}
            error={errors.note ? t(errors.note) : undefined}
          />
        </Section>

        <Section
          icon="file"
          title={needsBill ? t('fund.billRequiredTitle') : t('fund.billTitle')}
          description={t('fund.billHint', { amount: formatRupees(book.billLimitPaise) })}
        >
          {form.bill ? (
            <ListRow
              leading={form.bill.kind === 'pdf' ? 'pdf' : 'photo'}
              title={form.bill.name}
              details={[fileSizeText(t, form.bill.size)]}
              action={{ label: t('fund.billRemove'), variant: 'link', onPress: () => update({ bill: null }) }}
            />
          ) : (
            <View style={styles.row}>
              <Button variant="secondary" icon="photo" label={t('fund.billPhoto')} onPress={() => void choose('image')} />
              <Button variant="secondary" icon="pdf" label={t('fund.billPdf')} onPress={() => void choose('pdf')} />
            </View>
          )}
          {errors.bill ? <AppText tone="danger">{t(errors.bill)}</AppText> : null}
        </Section>

        {willWait ? (
          <Notice tone="info">{t('fund.willWait', { amount: formatRupees(book.approvalLimitPaise) })}</Notice>
        ) : null}
        {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
        <Button icon="check" label={t('fund.save')} loading={busy} disabled={busy} onPress={() => void save()} />
        <AppText variant="small" tone="muted">
          {t('fund.neverDeleted')}
        </AppText>
      </Screen>
    );
  }

  // ---------------------------------------------------------------- one entry
  if (!entry) return null;
  const decider = canDecide(book, entry);
  const isMaker = entry.createdBy === book.myId;
  const reversal = entry.reversedById ? book.entries.find((e) => e.id === entry.reversedById) : undefined;
  const reversible = book.isKeeper && entry.status === 'approved' && entry.reversesId === null && entry.reversedById === null;
  const shownAmount = formatRupees(entry.direction === 'income' ? entry.amountPaise : -entry.amountPaise, true);

  return (
    <Screen underHeader onRefresh={load}>
      {header}
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      {entry.status === 'waiting' ? (
        <Notice tone="info" title={t('fund.waitingTitle')}>
          {decider ? t('fund.waitingForYou') : isMaker ? t('fund.waitingYours') : t('fund.waitingOther')}
        </Notice>
      ) : null}

      <Section
        icon={entry.direction}
        title={`${shownAmount} · ${categoryName(t, category.get(entry.categoryId))}`}
        description={entry.reversesId ? t('fund.reversalOf', { id: entry.reversesId }) : t(`fund.directions.${entry.direction}`)}
      >
        <DetailGrid
          details={[
            { label: t('fund.csv.status'), value: t(`fund.statuses.${entry.status}`) },
            { label: t('fund.csv.date'), value: formatDayMonthYear(entry.onDate) },
            { label: entry.direction === 'income' ? t('fund.fromLabel') : t('fund.toLabel'), value: entry.party ?? '-' },
            { label: t('fund.referenceLabel'), value: entry.reference ?? '-' },
            { label: t('fund.noteLabel'), value: entry.note ?? '-' },
            { label: t('fund.recordedBy'), value: `${entry.createdByName} · ${formatDateTimeInIndia(entry.createdAt)}` },
            ...(entry.decidedAt
              ? [
                  {
                    label: t('fund.decidedBy'),
                    value: [entry.decidedByName, formatDateTimeInIndia(entry.decidedAt), entry.decisionNote].filter(Boolean).join(' · '),
                  },
                ]
              : []),
            ...(entry.balanceAfterPaise !== null ? [{ label: t('fund.csv.balance'), value: formatRupees(entry.balanceAfterPaise) }] : []),
          ]}
        />
        {entry.billPath ? (
          <Button
            variant="secondary"
            icon="open"
            label={t('fund.billOpen', { name: entry.billName ?? '' })}
            onPress={() =>
              void openBill(entry.billPath ?? '').then((ok) => {
                if (!ok) setMessage({ tone: 'error', text: t('common.networkError') });
              })
            }
          />
        ) : null}
        {entry.reversesId ? (
          <Button
            variant="link"
            label={t('fund.openOriginal', { id: entry.reversesId })}
            onPress={() => router.push({ pathname: '/staff/fund/[id]', params: { id: String(entry.reversesId) } })}
          />
        ) : null}
        {reversal ? (
          <Button
            variant="link"
            label={t(reversal.status === 'waiting' ? 'fund.reversedWaiting' : 'fund.reversedBy', { id: reversal.id })}
            onPress={() => router.push({ pathname: '/staff/fund/[id]', params: { id: String(reversal.id) } })}
          />
        ) : null}
      </Section>

      {mode === null && (decider || (isMaker && entry.status === 'waiting') || reversible) ? (
        <View style={styles.row}>
          {decider ? (
            <>
              <Button icon="check" label={t('fund.approve')} loading={busy} disabled={busy} onPress={() => void run(() => decideEntry(entry.id, true, ''), t('fund.approved'))} />
              <Button variant="secondary" icon="cancel" label={t('fund.decline')} onPress={() => setMode('decline')} />
            </>
          ) : null}
          {isMaker && entry.status === 'waiting' ? (
            <Button variant="secondary" icon="restore" label={t('fund.withdraw')} onPress={() => setMode('withdraw')} />
          ) : null}
          {reversible ? <Button variant="secondary" icon="restore" label={t('fund.reverse')} onPress={() => setMode('reverse')} /> : null}
        </View>
      ) : null}

      {mode !== null ? (
        <Section
          icon={mode === 'decline' ? 'cancel' : 'restore'}
          title={t(`fund.${mode}Title`)}
          description={mode === 'reverse' ? t('fund.reverseHint', { amount: formatRupees(book.approvalLimitPaise) }) : undefined}
        >
          <TextField
            label={mode === 'withdraw' ? t('fund.withdrawNote') : t('fund.reasonLabel')}
            value={note}
            onChangeText={setNote}
            multiline
            maxLength={NOTE_MAX}
          />
          <View style={styles.row}>
            <Button
              icon="check"
              label={t(`fund.${mode}Save`)}
              loading={busy}
              disabled={busy || (mode !== 'withdraw' && !note.trim())}
              onPress={() =>
                void run(
                  mode === 'decline'
                    ? () => decideEntry(entry.id, false, note)
                    : mode === 'withdraw'
                      ? () => withdrawEntry(entry.id, note)
                      : () => reverseEntry(entry.id, note),
                  t(`fund.${mode}Done`),
                )
              }
            />
            <Button variant="link" label={t('syllabusEditor.cancel')} onPress={() => setMode(null)} />
          </View>
        </Section>
      ) : null}
      <AppText variant="small" tone="muted">
        {t('fund.neverDeleted')}
      </AppText>
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
});
