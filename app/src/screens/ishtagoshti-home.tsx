// I1 Ishtagoshti home, the tab for every role (Phase 2 slice 6, docs/DECISIONS.md #57): the sloka
// of the day (pinned by an editor, or the published slokas in turn, the same for everyone), how
// many slokas I have memorised, the themes, and all slokas. Editors (the Guru and coordinators the
// Guru marked) also get "Add a sloka" and "Add a theme". Routes: student/(tabs)/ishtagoshti.tsx and
// staff/(tabs)/ishtagoshti.tsx. Data: src/data/ishtagoshti.ts.

import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { IgMarks, openIg, SlokaVerse, type IgArea } from '@/components/ishtagoshti-parts';
import { ListRow } from '@/components/list-row';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { StatGrid, StatTile } from '@/components/stat-tile';
import { fetchIshtagoshtiHome, inLanguage, type IshtagoshtiHome as Home } from '@/data/ishtagoshti';

/** I1 for students or staff. */
export function IshtagoshtiHome({ area }: { area: IgArea }) {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const language = profile?.language ?? 'en';
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

  const today = home?.today ?? null;
  const translation = today ? inLanguage(today.translation, language) : null;

  return (
    <Screen underHeader onRefresh={load}>
      <AppText tone="muted">{t('ishtagoshti.intro')}</AppText>
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
          {today ? (
            <Section icon="today" title={t('ishtagoshti.today')} description={today.ref}>
              <IgMarks sample={today.sample} published={today.published} />
              <SlokaVerse sloka={today} compact />
              {translation ? <AppText>{translation.text}</AppText> : null}
              <Button variant="secondary" icon="sloka" label={t('ishtagoshti.readSloka')} onPress={() => openIg.sloka(area, today.id)} />
            </Section>
          ) : (
            <EmptyState icon="ishtagoshti" title={t('ishtagoshti.noSlokas')} body={home.canEdit ? t('ishtagoshti.noSlokasEditor') : undefined} />
          )}

          <StatGrid>
            <StatTile icon="memorised" value={String(home.memorised.size)} label={t('ishtagoshti.memorisedCount')} />
            <StatTile icon="sloka" value={String(home.slokas.filter((s) => s.published).length)} label={t('ishtagoshti.slokaCount')} onPress={() => openIg.slokas(area)} />
          </StatGrid>

          <Section icon="theme" title={t('ishtagoshti.themes')} description={t('ishtagoshti.themesHint')}>
            {home.themes.length === 0 ? <AppText tone="muted">{t('ishtagoshti.noThemes')}</AppText> : null}
            {home.themes.map((theme) => (
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
          </Section>

          <Button variant="secondary" icon="sloka" label={t('ishtagoshti.allSlokas')} onPress={() => openIg.slokas(area)} />
          {home.canEdit ? (
            <Section icon="edit" title={t('ishtagoshti.editorTitle')} description={t('ishtagoshti.editorHint')}>
              <Button icon="add" label={t('ishtagoshti.addSloka')} onPress={() => openIg.editSloka('new')} />
              <Button variant="secondary" icon="add" label={t('ishtagoshti.addTheme')} onPress={() => openIg.editTheme('new')} />
            </Section>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
