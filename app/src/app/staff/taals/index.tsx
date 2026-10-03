// Taals (Phase 2 slice 3, docs/DECISIONS.md #49): the list of taals the S5 taal player offers, in
// their order, with beats, level, "Placeholder" and "Switched off". The Guru adds and edits them
// (taals/[id].tsx); coordinators read the same list. Opened from S5 ("Edit taals", Guru only).
// Data: data/practice.ts, table taals (supabase/migrations/0016_practice.sql).

import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { ListRow } from '@/components/list-row';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { fetchAllTaals, type Taal } from '@/data/practice';
import { levelName } from '@/i18n/labels';

/** The taals, for the Guru to edit. */
export default function TaalsScreen() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const isGuru = profile?.role === 'guru';
  const [taals, setTaals] = useState<Taal[] | null | undefined>(undefined);

  const load = useCallback(async () => {
    setTaals(await fetchAllTaals());
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <Screen underHeader onRefresh={load}>
      <Stack.Screen options={{ title: t('taals.title') }} />
      <Notice tone="info">{isGuru ? t('taals.introGuru') : t('taals.introStaff')}</Notice>
      {isGuru ? (
        <Button icon="add" label={t('taals.add')} onPress={() => router.push({ pathname: '/staff/taals/[id]', params: { id: 'new' } })} />
      ) : null}
      {taals === undefined ? <LoadingCards /> : null}
      {taals === null ? (
        <>
          <Notice tone="error" title={t('taals.loadFailed')}>
            {t('common.networkError')}
          </Notice>
          <Button icon="refresh" label={t('common.tryAgain')} onPress={() => void load()} />
        </>
      ) : null}
      {taals && taals.length === 0 ? <EmptyState icon="taal" title={t('taals.empty')} /> : null}
      {taals?.map((taal) => (
        <ListRow
          key={taal.id}
          leading="taal"
          title={taal.name}
          details={[
            [
              t('taals.beatsCount', { count: taal.beats }),
              taal.divisions.join(' + '),
              taal.levelId ? levelName(t, taal.levelId) : t('practice.allLevels'),
            ].join(' · '),
            taal.bols.join(' '),
            ...(taal.placeholder ? [t('practice.placeholderTitle')] : []),
            ...(taal.active ? [] : [t('taals.switchedOff')]),
          ]}
          onPress={() => router.push({ pathname: '/staff/taals/[id]', params: { id: String(taal.id) } })}
        />
      ))}
    </Screen>
  );
}
