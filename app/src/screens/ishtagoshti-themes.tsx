// Ishtagoshti themes, from the Themes circle on I1 (simple home, docs/DECISIONS.md #243): every
// theme with how many slokas it gathers and its Sample / Draft marks, each opening the theme. This
// list was on I1 before the circles. Routes: student/, staff/ and subscriber/ishtagoshti/themes.tsx.
// Data: fetchIshtagoshtiHome (src/data/ishtagoshti.ts), the same call as I1.

import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { openIg, type IgArea } from '@/components/ishtagoshti-parts';
import { ListRow } from '@/components/list-row';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { fetchIshtagoshtiHome, type IshtagoshtiHome as Home } from '@/data/ishtagoshti';

/** The themes of Ishtagoshti, for one area. */
export function IshtagoshtiThemes({ area }: { area: IgArea }) {
  const { t } = useTranslation();
  const { profile } = useAuth();
  // undefined = loading, null = could not load.
  const [home, setHome] = useState<Home | null | undefined>(undefined);

  const load = useCallback(async () => {
    if (!profile) return;
    setHome(await fetchIshtagoshtiHome(profile.id));
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <Screen underHeader onRefresh={load}>
      <Stack.Screen options={{ title: t('ishtagoshti.themes') }} />
      <AppText tone="muted">{t('ishtagoshti.themesHint')}</AppText>
      {home === undefined ? <LoadingCards /> : null}
      {home === null ? (
        <>
          <Notice tone="error" title={t('ishtagoshti.loadFailed')}>
            {t('common.networkError')}
          </Notice>
          <Button icon="refresh" label={t('common.tryAgain')} onPress={() => void load()} />
        </>
      ) : null}
      {home && home.themes.length === 0 ? <AppText tone="muted">{t('ishtagoshti.noThemes')}</AppText> : null}
      {home?.themes.map((theme) => (
        <ListRow
          key={theme.id}
          leading="theme"
          title={theme.title}
          details={[
            t('ishtagoshti.slokasInTheme', { count: theme.slokaIds.length }),
            [theme.sample ? t('ishtagoshti.sample') : '', theme.published ? '' : t('ishtagoshti.draft')].filter(Boolean).join(' · '),
          ].filter(Boolean)}
          onPress={() => openIg.theme(area, theme.id)}
        />
      ))}
    </Screen>
  );
}