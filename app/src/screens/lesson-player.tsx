// V3 Lesson-video player (Phase 2 slice 4, docs/DECISIONS.md #56), for students (route
// student/lesson/[id]) and staff (staff/lesson/[id]); the id is a material's. The video and its controls (speed, A-B
// loop, mirror and zoom for the team's own files) are components/lesson-video-panel.tsx, which the chapter screen's
// Video tab shows too (#786).
// 0064 (#683-#685): one lesson screen with Video / Audio / Notes tabs, only those the lesson has (no tab bar when it
// has the video alone). The video is the first tab; the audio's link is made only when its tab is first opened, and
// leaving a tab pauses what it plays. Nothing here records progress: a lesson is ticked as learnt by the teacher (C9).

import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { ChoiceGroup } from '@/components/choice-group';
import { LessonAudio } from '@/components/lesson-audio';
import { LessonVideoPanel } from '@/components/lesson-video-panel';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { fetchMaterial, lessonFormats, lessonSourceOf, type LessonFormat, type Material } from '@/data/materials';
import { spacing } from '@/theme/use-theme';

/** The lesson-video player screen. */
export function LessonPlayer() {
  const { t } = useTranslation();
  const { id: idParam } = useLocalSearchParams<{ id: string }>();
  const id = Number(idParam);
  const [loaded, setLoaded] = useState<Material | 'not_found' | null | undefined>(undefined);
  // 0064: the open tab (null = the first the lesson has) and whether the Audio tab was ever opened.
  const [tab, setTab] = useState<LessonFormat | null>(null);
  const [audioOpened, setAudioOpened] = useState(false);

  const load = useCallback(async () => {
    setLoaded(await fetchMaterial(id));
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const material = loaded && loaded !== 'not_found' ? loaded : null;
  const source = material ? lessonSourceOf(material) : null;
  const formats = material ? lessonFormats(material) : [];
  const current = tab ?? formats[0] ?? 'video';

  const header = <Stack.Screen options={{ title: material?.title ?? t('lessonPlayer.title') }} />;

  if (!material || !source) {
    return (
      <Screen underHeader centred>
        {header}
        {loaded === undefined ? <LoadingCards /> : null}
        {loaded === 'not_found' || (material && !source) ? <Notice tone="error">{t('lessonPlayer.notFound')}</Notice> : null}
        {loaded === null ? (
          <>
            <Notice tone="error">{t('common.networkError')}</Notice>
            <Button icon="refresh" label={t('common.tryAgain')} onPress={() => void load()} />
          </>
        ) : null}
      </Screen>
    );
  }

  const changeTab = (next: LessonFormat) => {
    // Leaving the video pauses it (the panel's `active`; YouTube's terms: nothing plays from a player not on screen).
    if (next === 'audio') setAudioOpened(true);
    setTab(next);
  };

  return (
    <Screen underHeader wide>
      {header}
      {formats.length > 1 ? (
        <ChoiceGroup<LessonFormat>
          chips
          label={t('lessonPlayer.tabsLabel')}
          value={current}
          onChange={changeTab}
          choices={formats.map((f) => ({ value: f, label: t(`lessonPlayer.tabs.${f}`), icon: TAB_ICON[f] }))}
        />
      ) : null}
      {/* A tab not shown stays mounted (the video keeps its place) but takes no room. */}
      <View style={current === 'video' ? styles.tab : styles.hidden}>
        <LessonVideoPanel material={material} source={source} active={current === 'video'} />
      </View>

      {audioOpened && material.audioPath ? (
        <View style={current === 'audio' ? styles.tab : styles.hidden}>
          <Section icon="audio" title={t('lessonPlayer.tabs.audio')}>
            <LessonAudio path={material.audioPath} name={material.audioName} active={current === 'audio'} />
          </Section>
        </View>
      ) : null}

      {current === 'notes' && material.notes ? (
        <Section icon="notes" title={t('lessonPlayer.tabs.notes')}>
          <AppText selectable>{material.notes}</AppText>
        </Section>
      ) : null}

      <AppText variant="small" tone="muted">
        {t('lessonPlayer.progressNote')}
      </AppText>
    </Screen>
  );
}

/** The icon of each tab. */
const TAB_ICON = { video: 'lessonVideo', audio: 'audio', notes: 'notes' } as const;

const styles = StyleSheet.create({
  tab: {
    gap: spacing.md,
  },
  hidden: {
    display: 'none',
  },
});
