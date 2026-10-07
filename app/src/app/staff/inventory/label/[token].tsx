// C19: the item of a scanned label (docs/DECISIONS.md #159). Reached from /i/<token> (the QR link
// opened in a browser, src/app/i/[token].tsx) and from the in-app scanners. Finds the item with
// resolve_asset and opens its screen; an unknown label or another centre's item gets a clear
// message instead. Data: data/inventory.ts; migration 0035.

import { router, Stack, useLocalSearchParams } from 'expo-router';
import type { ParseKeys } from 'i18next';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { resolveAsset, type Resolved } from '@/data/inventory';

/** Resolves the label and forwards to the item. */
export default function LabelScreen() {
  const { t } = useTranslation();
  const { token } = useLocalSearchParams<{ token: string }>();
  const [outcome, setOutcome] = useState<Resolved | { errorKey: ParseKeys } | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void resolveAsset(token ?? '').then((result) => {
      if (cancelled) return;
      if ('result' in result && result.result === 'ok') {
        router.replace({ pathname: '/staff/inventory/[id]', params: { id: String(result.id) } });
      } else setOutcome(result);
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <Screen underHeader centred>
      <Stack.Screen options={{ title: t('labels.scanTitle') }} />
      {outcome === undefined ? <LoadingCards /> : null}
      {outcome && 'errorKey' in outcome ? <Notice tone="error">{t(outcome.errorKey)}</Notice> : null}
      {outcome && 'result' in outcome && outcome.result === 'unknown' ? (
        <EmptyState icon="instruments" title={t('labels.unknownTitle')} body={t('labels.unknownBody')} />
      ) : null}
      {outcome && 'result' in outcome && outcome.result === 'other_centre' ? (
        <EmptyState icon="instruments" title={t('labels.otherCentreTitle')} body={t('labels.otherCentreBody', { centre: outcome.centre })} />
      ) : null}
      {outcome ? <Button variant="secondary" icon="instruments" label={t('labels.toInventory')} onPress={() => router.replace('/staff/inventory')} /> : null}
    </Screen>
  );
}
