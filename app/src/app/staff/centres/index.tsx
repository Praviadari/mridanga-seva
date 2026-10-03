// G9 Centres and attendance area, the Guru only: every centre, those in use first, with its
// address, open window, GPS point and radius, and how many students call it home; "Add a centre".
// A centre opens ./[id].tsx to edit or switch it off. Data: src/data/centres.ts.

import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Columns } from '@/components/columns';
import { GuruOnly } from '@/components/guru-only';
import { ListRow } from '@/components/list-row';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { fetchCentres, type Centre } from '@/data/centres';

/** The list of centres. */
export default function CentresScreen() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  // undefined = loading, null = could not load.
  const [centres, setCentres] = useState<Centre[] | null | undefined>(undefined);

  const load = useCallback(async () => {
    setCentres(await fetchCentres());
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (profile?.role !== 'guru') return <GuruOnly title={t('centres.title')} />;
  const header = <Stack.Screen options={{ title: t('centres.title') }} />;

  if (centres === null) {
    return (
      <Screen underHeader centred>
        {header}
        <Notice tone="error" title={t('centres.loadFailed')}>
          {t('common.networkError')}
        </Notice>
        <Button icon="refresh" label={t('common.tryAgain')} onPress={() => void load()} />
      </Screen>
    );
  }

  return (
    <Screen underHeader wide onRefresh={load}>
      {header}
      <AppText tone="muted">{t('centres.intro')}</AppText>
      <Notice tone="info">{t('centres.phoneCheckLater')}</Notice>
      <Button icon="add" label={t('centres.add')} onPress={() => router.push({ pathname: '/staff/centres/[id]', params: { id: 'new' } })} />
      {centres === undefined ? <LoadingCards /> : null}
      {centres ? (
        <Columns>
          {centres.map((c) => (
            <ListRow
              key={c.id}
              leading="location"
              title={c.active ? c.name : t('centres.offName', { name: c.name })}
              details={[
                c.address ?? t('centres.noAddress'),
                t('centres.windowLine', { opens: c.opensAt, closes: c.closesAt }),
                c.lat !== null && c.lng !== null
                  ? t('centres.areaLine', { lat: c.lat, lng: c.lng, radius: c.radiusM })
                  : t('centres.noPoint'),
                t('centres.studentsLine', { count: c.students }),
              ]}
              onPress={() => router.push({ pathname: '/staff/centres/[id]', params: { id: String(c.id) } })}
            />
          ))}
        </Columns>
      ) : null}
    </Screen>
  );
}
