// I2 One theme of Ishtagoshti (Phase 2 slice 6, docs/DECISIONS.md #57): the facilitator's
// introduction, questions to think about, and its slokas in order. Editors get "Edit theme" (I11).
// Routes: student/ishtagoshti/theme/[id].tsx and staff/ishtagoshti/theme/[id].tsx.

import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { IgMarks, openIg, SlokaRow, type IgArea } from '@/components/ishtagoshti-parts';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { fetchIshtagoshtiHome, type IshtagoshtiHome, type Theme } from '@/data/ishtagoshti';

/** I2 for students or staff. */
export function IshtagoshtiTheme({ area }: { area: IgArea }) {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const language = profile?.language ?? 'en';
  const [home, setHome] = useState<IshtagoshtiHome | null | undefined>(undefined);

  const load = useCallback(async () => {
    if (!profile) return;
    setHome(await fetchIshtagoshtiHome(profile.id));
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const theme: Theme | undefined = home?.themes.find((th) => th.id === Number(id));
  const header = <Stack.Screen options={{ title: theme?.title ?? t('ishtagoshti.themeTitle') }} />;

  if (home === undefined) {
    return (
      <Screen underHeader>
        {header}
        <LoadingCards />
      </Screen>
    );
  }
  if (home === null || !theme) {
    return (
      <Screen underHeader centred>
        {header}
        <Notice tone="error" title={home === null ? t('ishtagoshti.loadFailed') : t('ishtagoshti.themeNotFound')}>
          {home === null ? t('common.networkError') : undefined}
        </Notice>
        <Button icon="refresh" label={t('common.tryAgain')} onPress={() => void load()} />
      </Screen>
    );
  }

  const slokas = theme.slokaIds.flatMap((sid) => home.slokas.filter((s) => s.id === sid));
  const questions = (theme.questions ?? '').split('\n').map((q) => q.trim()).filter(Boolean);

  return (
    <Screen underHeader onRefresh={load}>
      {header}
      <IgMarks sample={theme.sample} published={theme.published} />
      {theme.intro ? <AppText>{theme.intro}</AppText> : null}
      <Section icon="sloka" title={t('ishtagoshti.slokasInTheme', { count: slokas.length })}>
        {slokas.length === 0 ? <AppText tone="muted">{t('ishtagoshti.themeEmpty')}</AppText> : null}
        {slokas.map((s) => (
          <SlokaRow key={s.id} area={area} sloka={s} language={language} memorised={home.memorised.has(s.id)} />
        ))}
      </Section>
      {questions.length > 0 ? (
        <Section icon="feedback" title={t('ishtagoshti.questions')} description={t('ishtagoshti.questionsHint')}>
          {questions.map((q, i) => (
            <AppText key={i}>{`${i + 1}. ${q}`}</AppText>
          ))}
        </Section>
      ) : null}
      {home.canEdit && area === 'staff' ? (
        <Button variant="secondary" icon="edit" label={t('ishtagoshti.editTheme')} onPress={() => openIg.editTheme(theme.id)} />
      ) : null}
    </Screen>
  );
}
