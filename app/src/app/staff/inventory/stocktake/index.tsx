// C19 stocktake (docs/DECISIONS.md #160): the counts of a centre's items, newest first, with the
// open one on top. Start (or join) the count for a centre here; a row opens the count (./[id].tsx).
// Data: data/inventory.ts; migration 0035.

import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/button';
import { ChoiceGroup } from '@/components/choice-group';
import { EmptyState } from '@/components/empty-state';
import { ListRow } from '@/components/list-row';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { fetchCentres, type Centre } from '@/data/centres';
import { fetchMyCentreId, fetchStocktakes, startStocktake, type Stocktake } from '@/data/inventory';
import { formatDateTime } from '@/lib/dates';

/** The list of counts. */
export default function StocktakesScreen() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const isGuru = profile?.role === 'guru';
  const [counts, setCounts] = useState<Stocktake[] | null | undefined>(undefined);
  const [centres, setCentres] = useState<Centre[]>([]);
  const [centre, setCentre] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [list, all, mine] = await Promise.all([
      fetchStocktakes(),
      fetchCentres(),
      profile ? fetchMyCentreId(profile.id) : Promise.resolve(null),
    ]);
    setCounts(list);
    const active = (all ?? []).filter((c) => c.active);
    setCentres(active);
    setCentre((current) => current ?? mine ?? active[0]?.id ?? null);
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function start() {
    if (centre === null) return;
    setBusy(true);
    setError(null);
    const outcome = await startStocktake(centre);
    setBusy(false);
    if (outcome.errorKey) setError(t(outcome.errorKey));
    else if (outcome.id) router.push({ pathname: '/staff/inventory/stocktake/[id]', params: { id: String(outcome.id) } });
  }

  // A coordinator counts their own centre; the Guru picks one.
  const choosable = isGuru ? centres : centres.filter((c) => c.id === centre);

  return (
    <Screen underHeader onRefresh={load}>
      <Stack.Screen options={{ title: t('stocktake.title') }} />
      <Notice tone="info">{t('stocktake.intro')}</Notice>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {choosable.length > 1 ? (
        <ChoiceGroup<number> chips label={t('stocktake.centre')} choices={choosable.map((c) => ({ value: c.id, label: c.name }))} value={centre ?? choosable[0].id} onChange={setCentre} />
      ) : null}
      <Button icon="stocktake" label={t('stocktake.start')} loading={busy} disabled={busy || centre === null} onPress={() => void start()} />
      {counts === undefined ? <LoadingCards /> : null}
      {counts === null ? (
        <>
          <Notice tone="error" title={t('stocktake.loadFailed')}>
            {t('common.networkError')}
          </Notice>
          <Button icon="refresh" label={t('common.tryAgain')} onPress={() => void load()} />
        </>
      ) : null}
      {counts && counts.length === 0 ? <EmptyState icon="stocktake" title={t('stocktake.none')} /> : null}
      {counts?.map((count) => (
        <ListRow
          key={count.id}
          leading="stocktake"
          highlighted={count.finishedAt === null}
          title={`${count.centreName} · ${formatDateTime(count.startedAt)}`}
          details={[
            count.finishedAt === null
              ? t('stocktake.openLine', { name: count.startedBy })
              : t('stocktake.doneLine', { seen: count.seen ?? 0, expected: count.expected ?? 0, missing: count.missing ?? 0, lent: count.lent ?? 0 }),
          ]}
          onPress={() => router.push({ pathname: '/staff/inventory/stocktake/[id]', params: { id: String(count.id) } })}
        />
      ))}
    </Screen>
  );
}
