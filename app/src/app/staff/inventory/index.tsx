// C19 Inventory (Phase 2 slice 8, docs/DECISIONS.md #65): the temple's instruments and other
// items with their condition and who holds each, filtered (in store, lent out, needs attention,
// retired). A row opens the item (./[id].tsx): lend, take back, condition check, history. The
// Guru adds items here. Opened from the Instruments circle of the staff ring.
// Data: data/inventory.ts; migration 0023_team_tools.sql.

import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/button';
import { ChoiceGroup } from '@/components/choice-group';
import { Columns } from '@/components/columns';
import { EmptyState } from '@/components/empty-state';
import { ListRow } from '@/components/list-row';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { fetchInventory, type InventoryItem } from '@/data/inventory';
import { formatDate, todayLocal, localDate } from '@/lib/dates';

type Filter = 'all' | 'store' | 'out' | 'attention' | 'retired';

function matches(item: InventoryItem, filter: Filter): boolean {
  switch (filter) {
    case 'retired':
      return item.retiredAt !== null;
    case 'all':
      return item.retiredAt === null;
    case 'store':
      return item.retiredAt === null && item.holder === null;
    case 'out':
      return item.retiredAt === null && item.holder !== null;
    case 'attention':
      return item.retiredAt === null && item.condition !== 'good';
  }
}

/** The inventory list. */
export default function InventoryScreen() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const isGuru = profile?.role === 'guru';
  const [items, setItems] = useState<InventoryItem[] | null | undefined>(undefined);
  const [filter, setFilter] = useState<Filter>('all');

  const load = useCallback(async () => {
    setItems(await fetchInventory());
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const today = todayLocal();
  const shown = items?.filter((item) => matches(item, filter)) ?? [];
  const count = (f: Filter) => items?.filter((item) => matches(item, f)).length ?? 0;

  return (
    <Screen underHeader wide onRefresh={load}>
      <Stack.Screen options={{ title: t('inventory.title') }} />
      <Notice tone="info">{isGuru ? t('inventory.introGuru') : t('inventory.introStaff')}</Notice>
      {isGuru ? (
        <Button icon="add" label={t('inventory.add')} onPress={() => router.push({ pathname: '/staff/inventory/[id]', params: { id: 'new' } })} />
      ) : null}
      <ChoiceGroup<Filter>
        chips
        label={t('inventory.show')}
        choices={(['all', 'store', 'out', 'attention', 'retired'] as const).map((f) => ({
          value: f,
          label: `${t(`inventory.filters.${f}`)} (${count(f)})`,
        }))}
        value={filter}
        onChange={setFilter}
      />
      {items === undefined ? <LoadingCards /> : null}
      {items === null ? (
        <>
          <Notice tone="error" title={t('inventory.loadFailed')}>
            {t('common.networkError')}
          </Notice>
          <Button icon="refresh" label={t('common.tryAgain')} onPress={() => void load()} />
        </>
      ) : null}
      {items && shown.length === 0 ? (
        <EmptyState icon="instruments" title={items.length === 0 ? t('inventory.empty') : t('inventory.noneHere')} />
      ) : null}
      <Columns>
        {shown.map((item) => {
          const overdue = item.holder?.dueOn ? item.holder.dueOn < today : false;
          return (
            <ListRow
              key={item.id}
              leading="instruments"
              highlighted={overdue || item.condition === 'damaged'}
              title={item.label}
              details={[
                [t(`inventory.kinds.${item.kind}`), t(`inventory.conditions.${item.condition}`)].join(' · '),
                ...(item.holder
                  ? [
                      t('inventory.withLine', {
                        name: item.holder.name,
                        date: formatDate(localDate(item.holder.issuedAt)),
                      }) +
                        (item.holder.dueOn
                          ? ` · ${t(overdue ? 'inventory.overdueLine' : 'inventory.dueLine', { date: formatDate(item.holder.dueOn) })}`
                          : ''),
                    ]
                  : item.retiredAt
                    ? [t('inventory.retiredLine')]
                    : [t('inventory.inStore')]),
              ]}
              onPress={() => router.push({ pathname: '/staff/inventory/[id]', params: { id: String(item.id) } })}
            />
          );
        })}
      </Columns>
    </Screen>
  );
}
