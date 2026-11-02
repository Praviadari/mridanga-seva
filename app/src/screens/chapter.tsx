// The chapter screen (docs/DECISIONS.md #786; the team's "Study Material Navigation" draft of 02-11-2026, screen D):
// one syllabus item of the student's level as a chapter of its lesson (lib/study-lessons.ts, #785), for students
// (student/chapter/[id]) and a staff member's own record (staff/me/chapter/[id], #319); the id is the item's.
// - A band under the header that never scrolls away: the lesson, "Chapter 2 of 5" and the chapter's title, whether it
//   was shown in class, and the tabs Video / Audio / Notes. All three tabs always; a tab with nothing says "Coming
//   soon". It opens on Video if the chapter has one, else Audio, else Notes; the tab is kept in the address (?tab=),
//   so Back from Practise now (or a reload) finds the same tab.
// - Video: the chapter's lesson videos (a chooser when there are several) with the player's controls: speed, A-B loop,
//   mirror and zoom for the team's own files (components/lesson-video-panel.tsx). Audio: each lesson audio with speed
//   and Repeat (components/lesson-audio.tsx). Notes: the item's text as the teachers wrote it (the class's C/O marks
//   are plain text in it, docs/NOTATION.md), the lessons' notes, note materials, and the PDFs and photos.
// - Nothing plays by itself. Starting one medium pauses the others: the video, any audio, and recording (`owner`).
//   A video or audio mounts only once its tab was opened (#684: nothing loads from a tab nobody opened).
// - Practice in place, under every tab: Practise now (the Playground games whose exercises are tied to this item, else
//   Practice tools; #788), the practice timer, and Record myself (kept on the phone, recorded without a sound).
//   Loop: A-B on the Video tab, Repeat on the Audio tab.
// - Previous / Next chapter in teaching order; the last chapter of a lesson leads to the next lesson, the last of all
//   back to the lessons. Opening a chapter remembers it for Continue learning (lib/last-chapter.ts, #787).
// Read-only like My Learning: the teachers tick a chapter as learnt (C9); playing media proves nothing.

import { router, Stack, useFocusEffect, useLocalSearchParams, usePathname, type Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { ChoiceGroup } from '@/components/choice-group';
import { LessonAudio } from '@/components/lesson-audio';
import { LessonVideoPanel } from '@/components/lesson-video-panel';
import { LoadingCards } from '@/components/loading-cards';
import { MaterialRow } from '@/components/material-row';
import { Notice } from '@/components/notice';
import { PracticeTimerLine } from '@/components/practice-timer-line';
import { RecordMyself } from '@/components/record-myself';
import { RefreshFailed } from '@/components/refresh-failed';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { lessonSourceOf } from '@/data/materials';
import { loadPlaygroundPack } from '@/data/playground';
import { fetchMyProgress, type MyProgress, type SyllabusEntry } from '@/data/syllabus';
import { formatDate } from '@/lib/dates';
import { goBackOr } from '@/lib/go-back';
import { useKeptLoad } from '@/lib/kept-load';
import { saveLastChapter } from '@/lib/last-chapter';
import { ownAreaOf, type OwnArea } from '@/lib/own-area';
import { cachedPack } from '@/lib/playground/pack-cache';
import type { PlayPack } from '@/lib/playground/types';
import { gamesForItem, type GameTile } from '@/lib/playground-games/catalogue';
import { playgroundOnForStudent, usePlaygroundSwitch } from '@/lib/playground-switch';
import { chapterSteps, CHAPTER_TABS, defaultTab, lessonOf, studyLessons, tabParam, type ChapterTab, type StudyLesson } from '@/lib/study-lessons';
import { spacing, useTheme } from '@/theme/use-theme';

/** The icon of each tab. */
const TAB_ICON = { video: 'lessonVideo', audio: 'audio', notes: 'notes' } as const;

/** A chapter's address in the area it is opened from. */
export function chapterHref(area: OwnArea, itemId: number, tab?: ChapterTab): Href {
  const pathname = area === 'me' ? '/staff/me/chapter/[id]' : '/student/chapter/[id]';
  return { pathname, params: tab ? { id: String(itemId), tab } : { id: String(itemId) } };
}

/** My Learning (the lessons) in the area. */
export function lessonsHref(area: OwnArea): Href {
  return area === 'me' ? '/staff/me/progress' : '/student/progress';
}

/** A lesson's title: its section, or the lone item's title. */
export function lessonTitle(lesson: StudyLesson<SyllabusEntry>): string {
  return lesson.section ?? lesson.chapters[0]?.title ?? '';
}

/** Practise now's games: those with an exercise tied to this item, when the Playground is on for this student. */
function useItemGames(itemId: number, on: boolean): GameTile[] {
  // The phone's copy at once; a newer pack (if any) when the server answers.
  const [pack, setPack] = useState<PlayPack | null>(() => cachedPack());
  useEffect(() => {
    if (!on) return;
    let live = true;
    void loadPlaygroundPack().then((load) => {
      if (live) setPack(load.pack);
    });
    return () => {
      live = false;
    };
  }, [on]);
  return on ? gamesForItem(pack?.exercises ?? [], itemId) : [];
}
const noSound = () => Promise.resolve(false);
const nothing = () => undefined;

/** The chapter screen. */
export function ChapterScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { profile } = useAuth();
  const myId = profile?.id ?? '';
  const area = ownAreaOf(usePathname());
  const params = useLocalSearchParams<{ id: string; tab?: string }>();
  const itemId = Number(params.id);
  // undefined = loading, null = could not load, 'not_found' = no student record for this login.
  const [loaded, setLoaded, refreshFailed] = useKeptLoad<MyProgress | 'not_found' | null | undefined>();
  const [tab, setTab] = useState<ChapterTab | null>(() => tabParam(params.tab));
  // A video or audio mounts once its tab was opened, and stays (keeps its place) while another tab shows.
  const [opened, setOpened] = useState<ChapterTab[]>([]);
  const [videoAt, setVideoAt] = useState(0);
  // What plays now ('video:12', 'audio:12', 'record'); every other medium pauses. null = nothing started yet.
  const [owner, setOwner] = useState<string | null>(null);
  const playground = usePlaygroundSwitch(myId);
  const games = useItemGames(itemId, area === 'student' && playgroundOnForStudent(playground));

  const load = useCallback(async () => {
    setLoaded(await fetchMyProgress(myId));
  }, [myId, setLoaded]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const progress = loaded && loaded !== 'not_found' ? loaded : null;
  const lessons = progress ? studyLessons(progress.items) : [];
  const item = progress?.items.find((i) => i.id === itemId) ?? null;
  const lesson = item ? lessonOf(lessons, itemId) : null;

  // Continue learning (#787): remembered once the chapter is known to be in the level.
  const lastId = item && lesson ? item.id : null;
  const lastTitle = item?.title ?? '';
  const lastLesson = lesson?.section ?? null;
  useEffect(() => {
    if (lastId !== null) saveLastChapter({ profileId: myId, itemId: lastId, title: lastTitle, lesson: lastLesson });
  }, [myId, lastId, lastTitle, lastLesson]);

  const header = <Stack.Screen options={{ title: item?.title ?? t('chapter.title') }} />;
  const back = <Button variant="link" icon="syllabus" label={t('chapter.backToLessons')} onPress={() => goBackOr(lessonsHref(area))} />;

  if (!progress || !item || !lesson) {
    return (
      <Screen underHeader centred>
        {header}
        {loaded === undefined ? <LoadingCards /> : null}
        {loaded === 'not_found' ? (
          <Notice tone="info" title={t('myQr.noRecordTitle')}>
            {t('myQr.noRecordBody')}
          </Notice>
        ) : null}
        {progress && !item ? <Notice tone="error">{t('chapter.notFound')}</Notice> : null}
        {loaded === null ? (
          <>
            <Notice tone="error" title={t('progress.loadFailed')}>
              {t('common.networkError')}
            </Notice>
            <Button icon="refresh" label={t('common.tryAgain')} onPress={() => void load()} />
          </>
        ) : null}
        {back}
      </Screen>
    );
  }

  const materials = progress.materials.filter((m) => m.itemId === item.id);
  const videos = materials.flatMap((m) => {
    const source = lessonSourceOf(m);
    return source ? [{ material: m, source }] : [];
  });
  const audios = materials.filter((m) => m.audioPath);
  const lessonNotes = materials.filter((m) => m.notes);
  const notes = materials.filter((m) => m.kind === 'note');
  const files = materials.filter((m) => m.kind === 'pdf' || m.kind === 'image');
  const notesCount = (item.description ? 1 : 0) + lessonNotes.length + notes.length + files.length;
  const current = tab ?? defaultTab({ videos: videos.length, audios: audios.length, notes: notesCount });
  const shown = (which: ChapterTab) => current === which || opened.includes(which);
  const mayPlay = (key: string, which: ChapterTab) => current === which && (owner === null || owner === key);
  const video = videos[Math.min(videoAt, videos.length - 1)] ?? null;
  // A game serves an exercise tied to an item only once the item is ticked (lib/playground/eligibility.ts): before
  // that, Practise now opens Practice tools.
  const itemGames = item.doneOn ? games : [];

  const chapterNo = lesson.chapters.indexOf(item) + 1;
  const steps = chapterSteps(lessons, item.id);
  const nextLesson = steps.next && steps.nextLesson ? lessonOf(lessons, steps.next.id) : null;
  const goTo = (chapter: SyllabusEntry) => router.replace(chapterHref(area, chapter.id));

  const changeTab = (next: ChapterTab) => {
    setOpened((list) => (list.includes(current) ? list : [...list, current]));
    setTab(next);
    // In the address, so Back from Practise now (or a reload) opens the same tab.
    router.setParams({ tab: next });
  };

  const comingSoon = (
    <Notice tone="info" title={t('chapter.comingSoonTitle')}>
      {t('chapter.comingSoon')}
    </Notice>
  );

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      {header}
      {/* The chapter's identity and the tabs stay in view while the page scrolls (the team's rule). */}
      <View style={[styles.band, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={styles.bandText}>
          {!lesson.single ? (
            <AppText variant="small" tone="muted" numberOfLines={2}>
              {lessonTitle(lesson)}
            </AppText>
          ) : null}
          <AppText variant="label" numberOfLines={2}>
            {lesson.single ? item.title : t('chapter.chapterOf', { n: chapterNo, total: lesson.chapters.length, title: item.title })}
          </AppText>
          <AppText variant="small" tone={item.doneOn ? 'success' : 'muted'}>
            {item.doneOn ? t('progress.doneOn', { date: formatDate(item.doneOn) }) : t('chapter.notTicked')}
          </AppText>
        </View>
        <ChoiceGroup<ChapterTab>
          segmented
          accessibilityLabel={t('lessonPlayer.tabsLabel')}
          value={current}
          onChange={changeTab}
          choices={CHAPTER_TABS.map((f) => ({ value: f, label: t(`lessonPlayer.tabs.${f}`), icon: TAB_ICON[f] }))}
        />
      </View>

      <Screen underHeader onRefresh={load}>
        <RefreshFailed at={refreshFailed} onRetry={() => load()} />

        <View style={current === 'video' ? styles.tab : styles.hidden}>
          {videos.length > 1 ? (
            <ChoiceGroup<number>
              chips
              label={t('chapter.whichVideo')}
              value={Math.min(videoAt, videos.length - 1)}
              onChange={setVideoAt}
              choices={videos.map((v, i) => ({ value: i, label: v.material.title }))}
            />
          ) : null}
          {video && shown('video') ? (
            <LessonVideoPanel
              key={video.material.id}
              material={video.material}
              source={video.source}
              active={mayPlay(`video:${video.material.id}`, 'video')}
              onPlay={() => setOwner(`video:${video.material.id}`)}
            />
          ) : null}
          {videos.length === 0 ? comingSoon : null}
        </View>

        <View style={current === 'audio' ? styles.tab : styles.hidden}>
          {shown('audio')
            ? audios.map((m) => (
                <Section key={m.id} icon="audio" title={m.title}>
                  <LessonAudio
                    path={m.audioPath ?? ''}
                    name={m.audioName}
                    active={mayPlay(`audio:${m.id}`, 'audio')}
                    onPlay={() => setOwner(`audio:${m.id}`)}
                  />
                </Section>
              ))
            : null}
          {audios.length === 0 ? comingSoon : null}
        </View>

        {current === 'notes' ? (
          <View style={styles.tab}>
            {item.description ? (
              <Section icon="notes" title={t('lessonPlayer.tabs.notes')}>
                <AppText selectable>{item.description}</AppText>
              </Section>
            ) : null}
            {lessonNotes.map((m) => (
              <Section key={`n${m.id}`} icon="notes" title={m.title}>
                <AppText selectable>{m.notes}</AppText>
              </Section>
            ))}
            {notes.map((m) => (
              <Section key={`b${m.id}`} icon="syllabus" title={m.title}>
                {m.body ? <AppText selectable>{m.body}</AppText> : null}
              </Section>
            ))}
            {files.map((m) => (
              <MaterialRow key={m.id} material={m} />
            ))}
            {notesCount === 0 ? comingSoon : null}
          </View>
        ) : null}

        <Section icon="practice" title={t('chapter.practiceTitle')} description={t('chapter.loopHint')}>
          {itemGames.length > 0 ? (
            itemGames.map((game) => (
              <Button
                key={game.game}
                icon={game.icon}
                label={t('chapter.practiseGame', { game: t(`playground.game.${game.game}.name`) })}
                onPress={() => game.route && router.push(game.route)}
              />
            ))
          ) : (
            <Button
              icon="practice"
              label={t('chapter.practiseNow')}
              onPress={() => router.push(area === 'me' ? '/staff/me/practice' : '/student/practice')}
            />
          )}
          <PracticeTimerLine profileId={myId} onSaved={nothing} />
        </Section>

        <RecordMyself
          kind="chapter"
          setting={null}
          startSound={noSound}
          startSoundOf={noSound}
          stopSound={nothing}
          onRecordStart={() => setOwner('record')}
        />

        <View style={styles.steps}>
          {steps.previous ? (
            <Button
              variant="secondary"
              icon="previous"
              label={t('chapter.previous', { title: steps.previous.title })}
              onPress={() => steps.previous && goTo(steps.previous)}
            />
          ) : null}
          {steps.next ? (
            <Button
              icon="chevron"
              label={
                nextLesson ? t('chapter.nextLesson', { title: lessonTitle(nextLesson) }) : t('chapter.next', { title: steps.next.title })
              }
              onPress={() => steps.next && goTo(steps.next)}
            />
          ) : (
            <Button icon="syllabus" label={t('chapter.lastDone')} onPress={() => goBackOr(lessonsHref(area))} />
          )}
        </View>
        {back}

        <AppText variant="small" tone="muted">
          {t('lessonPlayer.progressNote')}
        </AppText>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  band: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    borderBottomWidth: 1,
  },
  bandText: {
    gap: 2,
  },
  tab: {
    gap: spacing.md,
  },
  // A tab not shown stays mounted (the video keeps its place) but takes no room.
  hidden: {
    display: 'none',
  },
  steps: {
    gap: spacing.sm,
  },
});
