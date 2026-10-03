// All slokas of Ishtagoshti (part of I2, Phase 2 slice 6, docs/DECISIONS.md #57), in order, with a
// search over the reference, the transliteration and the translations. Editors see drafts too.
// Routes: student/ishtagoshti/slokas.tsx and staff/ishtagoshti/slokas.tsx.

import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { openIg, SlokaRow, type IgArea } from '@/components/ishtagoshti-parts';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { fetchIshtagoshtiHome, type IshtagoshtiHome } from '@/data/ishtagoshti';

/** Letters only, without accents, for searching "siksastaka" in "Śikṣāṣṭaka". */
function plain(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** The slokas list for students or staff. */
export function IshtagoshtiSlokas({ area }: { area: IgArea }) {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const language = profile?.language ?? 'en';
  const [home, setHome] = useState<IshtagoshtiHome | null | undefined>(undefined);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    if (!profile) return;
    setHome(await fetchIshtagoshtiHome(profile.id));
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const shown = useMemo(() => {
    if (!home) return [];
    const query = plain(search.trim());
    if (!query) return home.slokas;
    return home.slokas.filter((s) =>
      plain([s.ref, s.transliteration, s.devanagari, ...Object.values(s.translation)].join(' ')).includes(query),
    );
  }, [home, search]);

  return (
    <Screen underHeader onRefresh={load}>
      <Stack.Screen options={{ title: t('ishtagoshti.allSlokas') }} />
      {home === undefined ? <LoadingCards /> : null}
      {home === null ? (
        <>
          <Notice tone="error" title={t('ishtagoshti.loadFailed')}>
            {t('common.networkError')}
          </Notice>
          <Button icon="refresh" label={t('common.tryAgain')} onPress={() => void load()} />
        </>
      ) : null}
      {home ? (
        <>
          <TextField label={t('ishtagoshti.search')} value={search} onChangeText={setSearch} autoCapitalize="none" autoCorrect={false} />
          {home.canEdit && area === 'staff' ? <Button icon="add" label={t('ishtagoshti.addSloka')} onPress={() => openIg.editSloka('new')} /> : null}
          {home.slokas.length === 0 ? <EmptyState icon="ishtagoshti" title={t('ishtagoshti.noSlokas')} /> : null}
          {home.slokas.length > 0 && shown.length === 0 ? <AppText tone="muted">{t('ishtagoshti.searchNone')}</AppText> : null}
          {shown.map((s) => (
            <SlokaRow key={s.id} area={area} sloka={s} language={language} memorised={home.memorised.has(s.id)} />
          ))}
        </>
      ) : null}
    </Screen>
  );
}
