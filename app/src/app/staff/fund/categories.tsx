// Fund categories (Phase 2 slice 9, docs/DECISIONS.md #80), the Guru only: the built-in ones
// (donation, sponsorship; instruments, prasadam, events, travel, printing, other) and the Guru's
// own. The Guru adds one (income or expense, a name) or retires one: it is no longer offered for
// new entries, and old entries keep it. A category is never deleted. Data: data/fund.ts.

import { Stack, useFocusEffect } from 'expo-router';
import type { ParseKeys } from 'i18next';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/button';
import { ChoiceGroup } from '@/components/choice-group';
import { GuruOnly } from '@/components/guru-only';
import { ListRow } from '@/components/list-row';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { TextField } from '@/components/text-field';
import {
  addCategory,
  CATEGORY_NAME_MAX,
  categoryName,
  fetchFundBook,
  setCategoryRetired,
  type Direction,
  type FundBook,
} from '@/data/fund';

/** The categories. */
export default function FundCategoriesScreen() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const [book, setBook] = useState<FundBook | null | undefined>(undefined);
  const [direction, setDirection] = useState<Direction>('expense');
  const [name, setName] = useState('');
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

  const header = <Stack.Screen options={{ title: t('fund.categoriesTitle') }} />;
  if (profile?.role !== 'guru') return <GuruOnly title={t('fund.categoriesTitle')} />;

  async function run(action: () => Promise<{ errorKey?: ParseKeys }>, done: string) {
    setBusy(true);
    setMessage(null);
    const outcome = await action();
    setBusy(false);
    setMessage(outcome.errorKey ? { tone: 'error', text: t(outcome.errorKey) } : { tone: 'success', text: done });
    if (!outcome.errorKey) {
      setName('');
      await load();
    }
  }

  return (
    <Screen underHeader onRefresh={load}>
      {header}
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      <Section icon="add" title={t('fund.categoryAdd')} description={t('fund.categoryAddHint')}>
        <ChoiceGroup<Direction>
          choices={(['income', 'expense'] as const).map((d) => ({ value: d, label: t(`fund.directions.${d}`) }))}
          value={direction}
          onChange={setDirection}
        />
        <TextField label={t('fund.categoryNameLabel')} value={name} onChangeText={setName} maxLength={CATEGORY_NAME_MAX} />
        <Button
          icon="add"
          label={t('fund.categoryAddSave')}
          loading={busy}
          disabled={busy || !name.trim()}
          onPress={() => void run(() => addCategory(direction, name), t('fund.categoryAdded'))}
        />
      </Section>
      {book === undefined ? <LoadingCards /> : null}
      {book === null ? (
        <Notice tone="error" title={t('fund.loadFailed')}>
          {t('common.networkError')}
        </Notice>
      ) : null}
      {book
        ? (['income', 'expense'] as const).map((d) => (
            <Section key={d} icon={d} title={t(`fund.directions.${d}`)}>
              {book.categories
                .filter((c) => c.direction === d)
                .map((c) => (
                  <ListRow
                    key={c.id}
                    title={categoryName(t, c)}
                    details={[c.retired ? t('fund.categoryRetired') : c.code ? t('fund.categoryBuiltIn') : t('fund.categoryOwn')]}
                    action={{
                      label: c.retired ? t('fund.categoryOffer') : t('fund.categoryRetire'),
                      variant: 'link',
                      disabled: busy,
                      onPress: () => void run(() => setCategoryRetired(c.id, !c.retired), t('fund.categorySaved')),
                    }}
                  />
                ))}
            </Section>
          ))
        : null}
    </Screen>
  );
}
