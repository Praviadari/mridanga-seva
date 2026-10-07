// C19, one item (Phase 2 slice 8, docs/DECISIONS.md #65). `id` = 'new': the Guru adds an item
// (kind, name or number, notes, condition now). Otherwise: the item with its condition and who
// holds it; staff lend it (find a student or staff member, the condition seen, an optional due
// date and note), take it back (condition seen, a note unless good) or record a condition check;
// the history, newest first. The Guru also edits the kind, name and notes, retires it or puts it
// back, and deletes one added by mistake. Since 0035: the label code and centre, a free-text
// category, and Print label (./labels.tsx); scanning a label opens this screen (DECISIONS #159).
// Data: data/inventory.ts; migrations 0023, 0035.

import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import type { ParseKeys } from 'i18next';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { ChoiceGroup } from '@/components/choice-group';
import { EmptyState } from '@/components/empty-state';
import { ListRow } from '@/components/list-row';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { TextField } from '@/components/text-field';
import {
  CATEGORY_MAX,
  checkItem,
  checkItemForm,
  CONDITIONS,
  deleteItem,
  fetchItem,
  issueItem,
  ITEM_KINDS,
  LABEL_MAX,
  LENDABLE,
  NOTES_MAX,
  returnItem,
  saveItem,
  searchBorrowers,
  setRetired,
  type Borrower,
  type Condition,
  type InventoryItem,
  type ItemCheck,
  type ItemForm,
  type ItemFormErrors,
} from '@/data/inventory';
import { localDate, formatDateTime, formatDate, parseDayMonthYear, todayLocal } from '@/lib/dates';
import { goBackOr } from '@/lib/go-back';
import { spacing } from '@/theme/use-theme';

type Mode = 'lend' | 'return' | 'check' | 'edit' | 'delete' | null;

const EMPTY_FORM: ItemForm = { kind: 'fibreglass', label: '', category: '', notes: '', condition: 'good', conditionNote: '' };

/** One inventory item. */
export default function InventoryItemScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ id: string }>();
  const isNew = params.id === 'new';
  const { profile } = useAuth();
  const isGuru = profile?.role === 'guru';

  // item null = a new one (the Guru's form).
  const [loaded, setLoaded] = useState<{ item: InventoryItem | null; history: ItemCheck[] } | 'not_found' | null | undefined>(
    isNew ? { item: null, history: [] } : undefined,
  );
  const [mode, setMode] = useState<Mode>(isNew ? 'edit' : null);
  const [form, setForm] = useState<ItemForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<ItemFormErrors>({});
  const [condition, setCondition] = useState<Condition>('good');
  const [note, setNote] = useState('');
  const [due, setDue] = useState('');
  const [search, setSearch] = useState('');
  const [found, setFound] = useState<Borrower[] | null>([]);
  const [borrower, setBorrower] = useState<Borrower | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);

  const load = useCallback(async () => {
    if (isNew) return;
    setLoaded(await fetchItem(Number(params.id)));
  }, [isNew, params.id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // Search as the name is typed (two letters or more).
  useEffect(() => {
    if (mode !== 'lend' || borrower) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void searchBorrowers(search).then((result) => {
        if (!cancelled) setFound(result);
      });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search, mode, borrower]);

  function open(next: Mode) {
    setMode(next);
    setMessage(null);
    setNote('');
    setDue('');
    setSearch('');
    setBorrower(null);
    if (next === 'lend' || next === 'return' || next === 'check') {
      const current = loaded && loaded !== 'not_found' && loaded.item ? loaded.item.condition : 'good';
      setCondition(next === 'lend' && !LENDABLE.includes(current) ? 'good' : current);
    }
    if (next === 'edit' && loaded && loaded !== 'not_found' && loaded.item) {
      const { item } = loaded;
      setForm({ kind: item.kind, label: item.label, category: item.category ?? '', notes: item.notes ?? '', condition: item.condition, conditionNote: '' });
    }
  }

  async function run(action: () => Promise<{ errorKey?: ParseKeys }>, done: string) {
    setBusy(true);
    setMessage(null);
    const outcome = await action();
    setBusy(false);
    if (outcome.errorKey) {
      setMessage({ tone: 'error', text: t(outcome.errorKey) });
      return false;
    }
    setMessage({ tone: 'success', text: done });
    setMode(null);
    await load();
    return true;
  }

  const title = isNew ? t('inventory.add') : loaded && loaded !== 'not_found' && loaded.item ? loaded.item.code : t('inventory.title');
  const header = <Stack.Screen options={{ title }} />;

  if ((isNew && !isGuru) || loaded === undefined || loaded === null || loaded === 'not_found') {
    return (
      <Screen underHeader centred>
        {header}
        {isNew && !isGuru ? <Notice tone="info">{t('inventory.guruOnly')}</Notice> : null}
        {loaded === undefined ? <LoadingCards /> : null}
        {loaded === 'not_found' ? <EmptyState icon="instruments" title={t('inventory.notFound')} /> : null}
        {loaded === null ? (
          <Notice tone="error" title={t('inventory.loadFailed')}>
            {t('common.networkError')}
          </Notice>
        ) : null}
      </Screen>
    );
  }

  const item = loaded.item;
  const history = loaded.history;
  const update = (patch: Partial<ItemForm>) => setForm((current) => ({ ...current, ...patch }));
  const conditionChoices = (only?: readonly Condition[]) =>
    (only ?? CONDITIONS).map((c) => ({ value: c, label: t(`inventory.conditions.${c}`) }));
  const noteNeeded = condition !== 'good';

  async function saveForm() {
    const problems = checkItemForm(form, isNew);
    setErrors(problems);
    if (Object.keys(problems).length > 0) return;
    setBusy(true);
    setMessage(null);
    const outcome = await saveItem(item?.id ?? null, form);
    setBusy(false);
    if (outcome.errorKey) setMessage({ tone: 'error', text: t(outcome.errorKey) });
    else if (isNew && outcome.id) router.replace({ pathname: '/staff/inventory/[id]', params: { id: String(outcome.id) } });
    else {
      setMode(null);
      setMessage({ tone: 'success', text: t('inventory.saved') });
      await load();
    }
  }

  function lend() {
    if (!item || !borrower) return;
    if (noteNeeded && !note.trim()) {
      setMessage({ tone: 'error', text: t('inventory.errors.note_required') });
      return;
    }
    let dueOn: string | null = null;
    if (due.trim()) {
      dueOn = parseDayMonthYear(due);
      if (!dueOn) {
        setMessage({ tone: 'error', text: t('inventory.errors.due_invalid') });
        return;
      }
      if (dueOn < todayLocal()) {
        setMessage({ tone: 'error', text: t('inventory.errors.due_past') });
        return;
      }
    }
    void run(() => issueItem(item.id, borrower, condition, note, dueOn), t('inventory.lent', { name: borrower.name }));
  }

  function noteCheck(): boolean {
    if (noteNeeded && !note.trim()) {
      setMessage({ tone: 'error', text: t('inventory.errors.note_required') });
      return false;
    }
    return true;
  }

  const conditionFields = (only?: readonly Condition[]) => (
    <>
      <ChoiceGroup<Condition> chips label={t('inventory.conditionLabel')} choices={conditionChoices(only)} value={condition} onChange={setCondition} />
      <TextField
        label={noteNeeded ? t('inventory.noteRequiredLabel') : t('inventory.noteLabel')}
        hint={t('inventory.noteHint')}
        value={note}
        onChangeText={setNote}
        multiline
        maxLength={NOTES_MAX}
      />
    </>
  );

  return (
    <Screen underHeader onRefresh={isNew ? undefined : load}>
      {header}
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}

      {item ? (
        <Section
          icon="instruments"
          title={` · ${item.label}`}
          description={[t(`inventory.kinds.${item.kind}`), item.category, item.centreName].filter(Boolean).join(' · ')}>
          <AppText>
            {t('inventory.conditionNow', { condition: t(`inventory.conditions.${item.condition}`) })}
            {item.conditionNote ? ` · ${item.conditionNote}` : ''}
          </AppText>
          <AppText variant="small" tone="muted">
            {t('inventory.conditionSince', { date: formatDateTime(item.conditionAt) })}
          </AppText>
          {item.notes ? <AppText variant="small">{item.notes}</AppText> : null}
          {item.retiredAt ? <Notice tone="info">{t('inventory.retiredNotice', { date: formatDate(localDate(item.retiredAt)) })}</Notice> : null}
          {item.holder ? (
            <Notice tone="info" title={t('inventory.withTitle', { name: item.holder.name })}>
              {[
                item.holder.rollNo,
                t('inventory.sinceLine', { date: formatDate(localDate(item.holder.issuedAt)) }),
                item.holder.dueOn ? t('inventory.dueLine', { date: formatDate(item.holder.dueOn) }) : null,
                item.holder.issueNote,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Notice>
          ) : null}
          {mode === null && !item.retiredAt ? (
            <View style={styles.row}>
              {item.holder ? (
                <Button icon="restore" label={t('inventory.takeBack')} onPress={() => open('return')} />
              ) : (
                <Button
                  icon="send"
                  label={t('inventory.lend')}
                  disabled={!LENDABLE.includes(item.condition)}
                  onPress={() => open('lend')}
                />
              )}
              <Button variant="secondary" icon="check" label={t('inventory.check')} onPress={() => open('check')} />
              <Button
                variant="link"
                icon="print"
                label={t('labels.printOne')}
                onPress={() => router.push({ pathname: '/staff/inventory/labels', params: { ids: String(item.id) } })}
              />
            </View>
          ) : null}
          {mode === null && !item.holder && !item.retiredAt && !LENDABLE.includes(item.condition) ? (
            <AppText variant="small" tone="muted">
              {t('inventory.notLendable')}
            </AppText>
          ) : null}
        </Section>
      ) : null}

      {mode === 'lend' && item ? (
        <Section icon="send" title={t('inventory.lendTitle')}>
          {borrower ? (
            <ListRow
              leading="initials"
              title={borrower.name}
              details={[borrower.kind === 'student' ? (borrower.rollNo ?? t('inventory.student')) : t('inventory.staffMember')]}
              action={{ label: t('inventory.change'), variant: 'link', onPress: () => setBorrower(null) }}
            />
          ) : (
            <>
              <TextField
                label={t('inventory.findLabel')}
                hint={t('inventory.findHint')}
                value={search}
                onChangeText={setSearch}
                autoCorrect={false}
              />
              {found === null ? <AppText tone="danger">{t('common.networkError')}</AppText> : null}
              {found && search.trim().length >= 2 && found.length === 0 ? <AppText tone="muted">{t('inventory.noOneFound')}</AppText> : null}
              {found?.map((b) => (
                <ListRow
                  key={`${b.kind}-${b.id}`}
                  leading="initials"
                  title={b.name}
                  details={[b.kind === 'student' ? (b.rollNo ?? t('inventory.student')) : t('inventory.staffMember')]}
                  onPress={() => setBorrower(b)}
                />
              ))}
            </>
          )}
          {conditionFields(LENDABLE)}
          <TextField label={t('inventory.dueLabel')} hint={t('inventory.dueHint')} value={due} onChangeText={setDue} keyboardType="numbers-and-punctuation" />
          <View style={styles.row}>
            <Button icon="send" label={t('inventory.lendSave')} loading={busy} disabled={busy || !borrower} onPress={lend} />
            <Button variant="link" label={t('syllabusEditor.cancel')} onPress={() => setMode(null)} />
          </View>
        </Section>
      ) : null}

      {mode === 'return' && item?.holder ? (
        <Section icon="restore" title={t('inventory.returnTitle', { name: item.holder.name })}>
          {conditionFields()}
          <View style={styles.row}>
            <Button
              icon="check"
              label={t('inventory.returnSave')}
              loading={busy}
              disabled={busy}
              onPress={() => {
                const loanId = item.holder?.loanId;
                if (loanId && noteCheck()) void run(() => returnItem(loanId, condition, note), t('inventory.returned'));
              }}
            />
            <Button variant="link" label={t('syllabusEditor.cancel')} onPress={() => setMode(null)} />
          </View>
        </Section>
      ) : null}

      {mode === 'check' && item ? (
        <Section icon="check" title={t('inventory.checkTitle')} description={t('inventory.checkHint')}>
          {conditionFields()}
          <View style={styles.row}>
            <Button
              icon="check"
              label={t('inventory.checkSave')}
              loading={busy}
              disabled={busy}
              onPress={() => {
                if (noteCheck()) void run(() => checkItem(item.id, condition, note), t('inventory.checked'));
              }}
            />
            <Button variant="link" label={t('syllabusEditor.cancel')} onPress={() => setMode(null)} />
          </View>
        </Section>
      ) : null}

      {mode === 'edit' && isGuru ? (
        <Section icon="edit" title={isNew ? t('inventory.add') : t('inventory.editTitle')}>
          <ChoiceGroup<(typeof ITEM_KINDS)[number]>
            label={t('inventory.kindLabel')}
            choices={ITEM_KINDS.map((k) => ({ value: k, label: t(`inventory.kinds.${k}`) }))}
            value={form.kind}
            onChange={(kind) => update({ kind })}
          />
          <TextField
            label={t('inventory.labelLabel')}
            hint={t('inventory.labelHint', { max: LABEL_MAX })}
            value={form.label}
            onChangeText={(label) => update({ label })}
            maxLength={LABEL_MAX + 10}
            error={errors.label ? t(errors.label) : undefined}
          />
          <TextField
            label={t('inventory.categoryLabel')}
            hint={t('inventory.categoryHint', { max: CATEGORY_MAX })}
            value={form.category}
            onChangeText={(category) => update({ category })}
            maxLength={CATEGORY_MAX + 10}
            error={errors.category ? t(errors.category) : undefined}
          />
          <TextField
            label={t('inventory.notesLabel')}
            hint={t('inventory.notesHint')}
            value={form.notes}
            onChangeText={(notes) => update({ notes })}
            multiline
            maxLength={NOTES_MAX + 20}
            error={errors.notes ? t(errors.notes) : undefined}
          />
          {isNew ? (
            <>
              <ChoiceGroup<Condition>
                chips
                label={t('inventory.conditionLabel')}
                choices={conditionChoices()}
                value={form.condition}
                onChange={(c) => update({ condition: c })}
              />
              <TextField
                label={form.condition === 'good' ? t('inventory.noteLabel') : t('inventory.noteRequiredLabel')}
                value={form.conditionNote}
                onChangeText={(conditionNote) => update({ conditionNote })}
                multiline
                maxLength={NOTES_MAX}
                error={errors.conditionNote ? t(errors.conditionNote) : undefined}
              />
            </>
          ) : null}
          <View style={styles.row}>
            <Button icon="check" label={isNew ? t('inventory.addSave') : t('inventory.save')} loading={busy} disabled={busy} onPress={() => void saveForm()} />
            {!isNew ? <Button variant="link" label={t('syllabusEditor.cancel')} onPress={() => setMode(null)} /> : null}
          </View>
        </Section>
      ) : null}

      {item ? (
        <Section icon="time" title={t('inventory.historyTitle')}>
          {history.map((h) => (
            <View key={h.id} style={styles.entry}>
              <AppText variant="label">
                {t(`inventory.historyKinds.${h.kind}`, { name: h.borrower ?? '' })} · {t(`inventory.conditions.${h.condition}`)}
              </AppText>
              <AppText variant="small" tone="muted">
                {[formatDateTime(h.at), h.by].filter(Boolean).join(' · ')}
              </AppText>
              {h.note ? <AppText variant="small">{h.note}</AppText> : null}
            </View>
          ))}
        </Section>
      ) : null}

      {item && isGuru && mode === null ? (
        <View style={styles.row}>
          <Button variant="link" icon="edit" label={t('inventory.edit')} onPress={() => open('edit')} />
          {item.retiredAt ? (
            <Button variant="link" icon="restore" label={t('inventory.unretire')} disabled={busy} onPress={() => void run(() => setRetired(item.id, false), t('inventory.saved'))} />
          ) : (
            <Button
              variant="link"
              icon="retire"
              label={t('inventory.retire')}
              disabled={busy || item.holder !== null}
              onPress={() => void run(() => setRetired(item.id, true), t('inventory.saved'))}
            />
          )}
          {history.every((h) => h.kind === 'added' || h.kind === 'check') ? (
            <Button variant="link" icon="delete" label={t('inventory.delete')} onPress={() => setMode('delete')} />
          ) : null}
        </View>
      ) : null}
      {item && mode === 'delete' ? (
        <>
          <Notice tone="error" title={t('inventory.deleteAsk')}>
            {t('inventory.deleteAskBody')}
          </Notice>
          <View style={styles.row}>
            <Button
              icon="delete"
              label={t('inventory.deleteYes')}
              loading={busy}
              disabled={busy}
              onPress={() =>
                void (async () => {
                  setBusy(true);
                  const outcome = await deleteItem(item.id);
                  setBusy(false);
                  if (outcome.errorKey) setMessage({ tone: 'error', text: t(outcome.errorKey) });
                  else goBackOr('/staff/inventory');
                })()
              }
            />
            <Button variant="link" label={t('syllabusEditor.cancel')} onPress={() => setMode(null)} />
          </View>
        </>
      ) : null}
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
  entry: {
    gap: 2,
    paddingVertical: spacing.xs,
  },
});
