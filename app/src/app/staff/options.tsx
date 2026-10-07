// G12 Option lists, the Guru only (migration 0036, docs/DECISIONS.md #166): the choices offered by the
// sign-up, About you and the desk — gender, how people heard of the class, occupation, service areas,
// the relation of an emergency contact — each with English, Telugu and Hindi labels, an order, and
// on / off. Off = no longer offered; answers already given keep it. Delete only an option nobody
// chose (the database refuses others, and the ones its rules need). Every change is in the audit log.

import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { ChoiceGroup } from '@/components/choice-group';
import { GuruOnly } from '@/components/guru-only';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { TextField } from '@/components/text-field';
import {
  addOption,
  checkLabels,
  deleteOption,
  fetchAllOptions,
  OPTION_LISTS,
  OTHER,
  saveOptionLabels,
  setOptionActive,
  swapOptions,
  type OptionLabels,
  type OptionList,
  type OptionRow,
} from '@/data/options';
import { cardLook, spacing, useTheme } from '@/theme/use-theme';

const EMPTY: OptionLabels = { en: '', te: '', hi: '' };

/** The option lists editor. */
export default function OptionListsScreen() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const { colors } = useTheme();
  // undefined = loading, null = could not load.
  const [rows, setRows] = useState<OptionRow[] | null | undefined>(undefined);
  const [list, setList] = useState<OptionList>('source');
  // The option being edited (its id), 'new' for the add form, or null.
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [labels, setLabels] = useState<OptionLabels>(EMPTY);
  const [labelErrors, setLabelErrors] = useState<Partial<Record<keyof OptionLabels, string>>>({});
  const [deleting, setDeleting] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);

  const load = useCallback(async () => setRows(await fetchAllOptions()), []);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (profile?.role !== 'guru') return <GuruOnly title={t('options.title')} />;
  const header = <Stack.Screen options={{ title: t('options.title') }} />;
  if (!rows) {
    return (
      <Screen underHeader centred={rows === null}>
        {header}
        {rows === undefined ? <LoadingCards /> : null}
        {rows === null ? (
          <>
            <Notice tone="error" title={t('options.loadFailed')}>
              {t('common.networkError')}
            </Notice>
            <Button icon="refresh" label={t('common.tryAgain')} onPress={() => void load()} />
          </>
        ) : null}
      </Screen>
    );
  }

  const items = rows.filter((r) => r.list === list).sort((a, b) => a.sort - b.sort || a.id - b.id);

  /** Runs a change, says how it went and loads the list again. */
  async function run(change: () => Promise<{ errorKey?: string }>, done: string) {
    setBusy(true);
    setMessage(null);
    const result = await change();
    setBusy(false);
    if (result.errorKey) {
      setMessage({ tone: 'error', text: t(result.errorKey as never) });
      return false;
    }
    setMessage({ tone: 'success', text: done });
    await load();
    return true;
  }

  function startEdit(row: OptionRow | null) {
    setEditing(row ? row.id : 'new');
    setLabels(row ? { en: row.en, te: row.te ?? '', hi: row.hi ?? '' } : EMPTY);
    setLabelErrors({});
    setDeleting(null);
  }

  async function saveLabels() {
    const found = checkLabels(labels);
    setLabelErrors(Object.fromEntries(Object.entries(found).map(([k, v]) => [k, t(v)])));
    if (Object.keys(found).length > 0) return;
    // New options go before "Other", which stays last.
    const other = items.find((r) => r.code === OTHER);
    const sort = Math.min(9000, Math.max(0, ...items.filter((r) => r.code !== OTHER).map((r) => r.sort)) + 10);
    const ok =
      editing === 'new'
        ? await run(() => addOption(list, labels, other ? Math.min(sort, other.sort - 1) : sort), t('options.added'))
        : await run(() => saveOptionLabels(editing as number, labels), t('options.saved'));
    if (ok) setEditing(null);
  }

  const labelForm = (
    <View style={styles.form}>
      <TextField label={t('options.labelEn')} value={labels.en} onChangeText={(en) => setLabels({ ...labels, en })}
        maxLength={80} error={labelErrors.en} />
      <TextField label={t('options.labelTe')} value={labels.te} onChangeText={(te) => setLabels({ ...labels, te })}
        maxLength={80} error={labelErrors.te} hint={t('options.labelOptional')} />
      <TextField label={t('options.labelHi')} value={labels.hi} onChangeText={(hi) => setLabels({ ...labels, hi })}
        maxLength={80} error={labelErrors.hi} hint={t('options.labelOptional')} />
      <Button icon="check" label={t('options.save')} loading={busy} onPress={() => void saveLabels()} />
      <Button variant="link" label={t('syllabusEditor.cancel')} onPress={() => setEditing(null)} />
    </View>
  );

  return (
    <Screen underHeader onRefresh={load}>
      {header}
      <AppText tone="muted">{t('options.intro')}</AppText>
      <ChoiceGroup
        chips
        label={t('options.whichList')}
        choices={OPTION_LISTS.map((l) => ({ value: l, label: t(`options.lists.${l}`) }))}
        value={list}
        onChange={(l) => {
          setList(l);
          setEditing(null);
          setDeleting(null);
          setMessage(null);
        }}
      />
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}

      <Section icon="lists" title={t(`options.lists.${list}`)} description={t(`options.hints.${list}`)}>
        {items.map((row, index) => (
          <View key={row.id} style={[cardLook(colors), styles.item]}>
            <AppText variant="label">{row.en}</AppText>
            <AppText variant="small" tone="muted">
              {[row.te, row.hi].filter(Boolean).join(' · ') || t('options.noTranslation')}
              {row.active ? '' : ` · ${t('options.offLabel')}`}
            </AppText>
            {editing === row.id ? (
              labelForm
            ) : deleting === row.id ? (
              <>
                <Notice tone="error" title={t('options.deleteAsk', { label: row.en })}>
                  {t('options.deleteBody')}
                </Notice>
                <Button label={t('options.delete')} loading={busy}
                  onPress={() => void run(() => deleteOption(row.id), t('options.deleted')).then(() => setDeleting(null))} />
                <Button variant="link" label={t('syllabusEditor.cancel')} onPress={() => setDeleting(null)} />
              </>
            ) : (
              <View style={styles.actions}>
                <Button variant="link" icon="edit" label={t('options.edit')} onPress={() => startEdit(row)} />
                <Button variant="link" icon="up" label={t('options.up')} disabled={busy || index === 0}
                  onPress={() => void run(() => swapOptions(row, items[index - 1]), t('options.moved'))} />
                <Button variant="link" icon="down" label={t('options.down')} disabled={busy || index === items.length - 1}
                  onPress={() => void run(() => swapOptions(row, items[index + 1]), t('options.moved'))} />
                <Button variant="link" icon={row.active ? 'retire' : 'restore'}
                  label={row.active ? t('options.switchOff') : t('options.switchOn')} disabled={busy}
                  onPress={() => void run(() => setOptionActive(row.id, !row.active), row.active ? t('options.switchedOff') : t('options.switchedOn'))} />
                <Button variant="link" icon="delete" label={t('options.delete')} disabled={busy} onPress={() => setDeleting(row.id)} />
              </View>
            )}
          </View>
        ))}
        {editing === 'new' ? labelForm : <Button variant="secondary" icon="add" label={t('options.add')} onPress={() => startEdit(null)} />}
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  item: {
    padding: spacing.md,
    gap: spacing.xs,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: spacing.sm,
  },
  form: {
    gap: spacing.md,
    marginTop: spacing.sm,
  },
});
