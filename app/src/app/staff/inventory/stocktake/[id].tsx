// C19, one count (docs/DECISIONS.md #160). Open: scan labels (or tap "Seen" on an item without a
// readable label); the list shows what is not seen yet, with a search; finish with an optional note,
// and the summary (expected, seen, lent out, missing with codes) is saved with who and when. The
// Guru may delete an open count started by mistake. Finished: the saved summary.
// Data: data/inventory.ts; migration 0035.

import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import type { ParseKeys } from 'i18next';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { ListRow } from '@/components/list-row';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { QrScanner } from '@/components/qr-scanner';
import { RouteIdGuard } from '@/components/route-id-guard';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { TextField } from '@/components/text-field';
import {
  deleteStocktake,
  fetchInventory,
  fetchStocktake,
  finishStocktake,
  NOTES_MAX,
  stocktakeSee,
  type CountedItem,
  type InventoryItem,
  type SeenResult,
  type Stocktake,
} from '@/data/inventory';
import { formatDateTime } from '@/lib/dates';
import { goBackOr } from '@/lib/go-back';
import { readScanText } from '@/lib/scan-text';
import { searchFold } from '@/lib/search-text';
import { spacing } from '@/theme/use-theme';

/** How long the same label is ignored after a scan, in milliseconds. */
const SAME_LABEL_PAUSE_MS = 4000;

type Loaded = { stocktake: Stocktake; seenIds: Set<number>; items: InventoryItem[] };

/** One count. */
function StocktakeScreenContent() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  const isGuru = profile?.role === 'guru';
  const [loaded, setLoaded] = useState<Loaded | 'not_found' | null | undefined>(undefined);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [last, setLast] = useState<{ tone: 'success' | 'info' | 'error'; text: string } | null>(null);
  const [search, setSearch] = useState('');
  const [note, setNote] = useState('');
  const [finishing, setFinishing] = useState(false);
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const lastLabel = useRef<{ token: string; at: number } | null>(null);

  const load = useCallback(async () => {
    const [count, items] = await Promise.all([fetchStocktake(Number(id)), fetchInventory()]);
    if (count === null || items === null) return setLoaded(null);
    if (count === 'not_found') return setLoaded('not_found');
    setLoaded({ ...count, items: items.filter((item) => item.centreId === count.stocktake.centreId && item.retiredAt === null) });
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  function say(result: SeenResult | { errorKey: ParseKeys }) {
    if ('errorKey' in result) return setLast({ tone: 'error', text: t(result.errorKey) });
    switch (result.result) {
      case 'seen':
        return setLast({ tone: 'success', text: t('stocktake.seenNow', { code: result.code, name: result.label }) });
      case 'already':
        return setLast({ tone: 'info', text: t('stocktake.seenBefore', { code: result.code, name: result.label }) });
      case 'retired':
        return setLast({ tone: 'info', text: t('stocktake.retiredItem', { code: result.code, name: result.label }) });
      case 'other_centre':
        return setLast({ tone: 'error', text: t('stocktake.otherCentre', { code: result.code, centre: result.centre }) });
      default:
        return setLast({ tone: 'error', text: t('labels.unknownTitle') });
    }
  }

  async function onScan(text: string) {
    if (working.current) return;
    const read = readScanText(text);
    const now = Date.now();
    if (read.kind !== 'asset') {
      setLast({ tone: 'error', text: read.kind === 'student' ? t('labels.studentCode') : t('labels.notALabel') });
      return;
    }
    if (lastLabel.current?.token === read.token && now - lastLabel.current.at < SAME_LABEL_PAUSE_MS) return;
    working.current = true;
    lastLabel.current = { token: read.token, at: now };
    say(await stocktakeSee(Number(id), { token: read.token }));
    working.current = false;
    void load();
  }

  async function tap(itemId: number) {
    setBusy(true);
    say(await stocktakeSee(Number(id), { itemId }));
    setBusy(false);
    void load();
  }

  const header = <Stack.Screen options={{ title: t('stocktake.oneTitle') }} />;
  if (loaded === undefined || loaded === null || loaded === 'not_found') {
    return (
      <Screen underHeader centred>
        {header}
        {loaded === undefined ? <LoadingCards /> : null}
        {loaded === 'not_found' ? <EmptyState icon="stocktake" title={t('stocktake.notFound')} /> : null}
        {loaded === null ? (
          <Notice tone="error" title={t('stocktake.loadFailed')}>
            {t('common.networkError')}
          </Notice>
        ) : null}
      </Screen>
    );
  }

  const { stocktake, seenIds, items } = loaded;
  const open = stocktake.finishedAt === null;

  if (!open) return <FinishedCount stocktake={stocktake} header={header} />;

  const term = searchFold(search.trim());
  const notSeen = items.filter((item) => !seenIds.has(item.id));
  const shown = notSeen.filter((item) => !term || searchFold(`${item.code} ${item.label} ${item.category ?? ''}`).includes(term));
  const seenCount = items.filter((item) => seenIds.has(item.id)).length;

  return (
    <Screen underHeader onRefresh={load}>
      {header}
      <Section
        icon="stocktake"
        title={`${stocktake.centreName} · ${formatDateTime(stocktake.startedAt)}`}
        description={t('stocktake.startedBy', { name: stocktake.startedBy })}>
        <AppText variant="label">{t('stocktake.progress', { seen: seenCount, count: items.length })}</AppText>
        {last ? <Notice tone={last.tone}>{last.text}</Notice> : null}
        {cameraOpen ? (
          <>
            <QrScanner onScan={(text) => void onScan(text)} />
            <Button variant="secondary" label={t('attendance.stopScan')} onPress={() => setCameraOpen(false)} />
          </>
        ) : (
          <Button icon="qr" label={t('stocktake.scan')} onPress={() => setCameraOpen(true)} />
        )}
      </Section>

      <Section icon="search" title={t('stocktake.notSeenTitle', { count: notSeen.length })} description={t('stocktake.notSeenHint')}>
        <TextField label={t('stocktake.searchLabel')} value={search} onChangeText={setSearch} autoCorrect={false} />
        {notSeen.length === 0 ? <AppText tone="muted">{t('stocktake.allSeen')}</AppText> : null}
        {shown.map((item) => (
          <ListRow
            key={item.id}
            leading="instruments"
            title={`${item.code} · ${item.label}`}
            details={[
              [item.category ?? t(`inventory.kinds.${item.kind}`), item.holder ? t('stocktake.lentTo', { name: item.holder.name }) : null]
                .filter(Boolean)
                .join(' · '),
            ]}
            action={{ label: t('stocktake.markSeen'), variant: 'secondary', disabled: busy, onPress: () => void tap(item.id) }}
          />
        ))}
      </Section>

      <Section icon="check" title={t('stocktake.finishTitle')} description={t('stocktake.finishHint')}>
        <TextField label={t('inventory.noteLabel')} value={note} onChangeText={setNote} multiline maxLength={NOTES_MAX} />
        <View style={styles.row}>
          <Button
            icon="check"
            label={t('stocktake.finish')}
            loading={finishing}
            disabled={finishing}
            onPress={() =>
              void (async () => {
                setFinishing(true);
                const outcome = await finishStocktake(stocktake.id, note);
                setFinishing(false);
                if (outcome.errorKey) setLast({ tone: 'error', text: t(outcome.errorKey) });
                else await load();
              })()
            }
          />
          {isGuru ? (
            <Button
              variant="link"
              icon="delete"
              label={t('stocktake.delete')}
              onPress={() =>
                void (async () => {
                  const outcome = await deleteStocktake(stocktake.id);
                  if (outcome.errorKey) setLast({ tone: 'error', text: t(outcome.errorKey) });
                  else goBackOr('/staff/inventory/stocktake');
                })()
              }
            />
          ) : null}
        </View>
      </Section>
    </Screen>
  );
}

/** The saved summary of a finished count. */
function FinishedCount({ stocktake, header }: { stocktake: Stocktake; header: ReactNode }) {
  const { t } = useTranslation();
  const missing = stocktake.summary?.missing ?? [];
  const lent = stocktake.summary?.lent ?? [];
  const row = (item: CountedItem) => (
    <ListRow
      key={item.id}
      leading="instruments"
      title={`${item.code} · ${item.label}`}
      details={[item.holder ? t('stocktake.lentTo', { name: item.holder }) : t(`inventory.kinds.${item.kind}`)]}
      onPress={() => router.push({ pathname: '/staff/inventory/[id]', params: { id: String(item.id) } })}
    />
  );
  return (
    <Screen underHeader>
      {header}
      <Section
        icon="stocktake"
        title={`${stocktake.centreName} · ${formatDateTime(stocktake.startedAt)}`}
        description={t('stocktake.finishedBy', { name: stocktake.finishedBy ?? '', date: formatDateTime(stocktake.finishedAt ?? '') })}>
        <AppText variant="label">
          {t('stocktake.doneLine', { seen: stocktake.seen ?? 0, expected: stocktake.expected ?? 0, missing: stocktake.missing ?? 0, lent: stocktake.lent ?? 0 })}
        </AppText>
        {stocktake.note ? <AppText>{stocktake.note}</AppText> : null}
      </Section>
      <Section icon="alert" title={t('stocktake.missingTitle', { count: missing.length })} description={t('stocktake.missingHint')}>
        {missing.length === 0 ? <AppText tone="muted">{t('stocktake.noneMissing')}</AppText> : missing.map(row)}
      </Section>
      {lent.length > 0 ? <Section icon="send" title={t('stocktake.lentTitle', { count: lent.length })}>{lent.map(row)}</Section> : null}
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

/** Checks the address's id before the screen loads anything (D6-07). */
export default function StocktakeScreen() {
  return (
    <RouteIdGuard kind="number">
      <StocktakeScreenContent />
    </RouteIdGuard>
  );
}
