// S4 My progress, for students: the syllabus of my current level in teaching order, with a tick
// and the date on the items I have shown in class, and a progress bar. Read-only: ticking is the
// coordinators' and the facilitator's (C9), and moving up a level is the facilitator's decision.
// Opened from the ring on the student home (S1). Data: fetchMyProgress in src/data/syllabus.ts.
// Since round 7 each item shows its lessons and materials (YouTube videos open in the YouTube app
// or the browser, PDFs and photos in the browser; components/material-row.tsx), and the lessons for
// the whole level come first. An item the facilitator retired shows only when it was ticked, and
// does not count (docs/DECISIONS.md #44).
// Also Me > My progress in the staff app, for a staff member's own record (0053, #319; staff/me/progress.tsx).
// Since 24-10-2026 the bar is the level path (components/level-path-view.tsx, #620). Since 29-10-2026 a level whose items name a
// section shows a heading over each section, in teaching order (#773, lib/syllabus-sections.ts); no sections = as before.
// Since 02-11-2026 (#785-#787, the team's "Study Material Navigation" draft) the items are lessons and chapters: a section
// is a Lesson folding open its items (Chapters), one open at a time, with "n of m chapters done"; an item without a
// section is a lesson of one chapter. A chapter opens the chapter screen (screens/chapter.tsx) with its videos, audio,
// notes, PDFs and photos and the practice tools. The lesson of the chapter opened last opens again on coming back, and
// Continue learning at the top leads to that chapter (lib/last-chapter.ts). The level's own lessons stay above.

import type { TFunction } from 'i18next';
import { router, Stack, useFocusEffect, usePathname } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { LevelPathView } from '@/components/level-path-view';
import { LessonFold } from '@/components/lesson-fold';
import { ListRow } from '@/components/list-row';
import { MaterialRow } from '@/components/material-row';
import { PracticePanel } from '@/components/practice-parts';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { lessonFormats, type Material } from '@/data/materials';
import { fetchMyProgress, type MyProgress, type SyllabusEntry } from '@/data/syllabus';
import { LEVEL_IDS, levelName } from '@/i18n/labels';
import { formatDate } from '@/lib/dates';
import { lastChapter, type LastChapter } from '@/lib/last-chapter';
import { levelPath } from '@/lib/level-path';
import { ownAreaOf } from '@/lib/own-area';
import { chaptersDone, lessonOf, studyLessons } from '@/lib/study-lessons';
import { chapterHref, lessonTitle } from '@/screens/chapter';
import { RefreshFailed } from '@/components/refresh-failed';
import { useKeptLoad } from '@/lib/kept-load';

/** The student's level with its progress bar and one row per syllabus item. */
export default function MyProgressScreen() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const myId = profile?.id ?? '';
  const area = ownAreaOf(usePathname());
  // undefined = loading, null = could not load, 'not_found' = no student record for this login.
  const [loaded, setLoaded, refreshFailed] = useKeptLoad<MyProgress | 'not_found' | null | undefined>();

  // The open lesson (one at a time; null = all closed), and the chapter opened last on this device (#787).
  const [openLesson, setOpenLesson] = useState<string | null>(null);
  const [last, setLast] = useState<LastChapter | null>(() => lastChapter(myId));
  // The last chapter whose lesson was opened for it: a newer one (Previous / Next went on) opens its lesson again.
  const [followed, setFollowed] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoaded(await fetchMyProgress(myId));
  }, [myId, setLoaded]);

  // Reload when the screen comes back into view, so a tick made in class shows at once.
  useFocusEffect(
    useCallback(() => {
      setLast(lastChapter(myId));
      void load();
    }, [load, myId]),
  );

  const progress = loaded && loaded !== 'not_found' && loaded !== null ? loaded : null;
  const lessons = progress ? studyLessons(progress.items) : [];
  const lastLesson = last ? lessonOf(lessons, last.itemId) : null;
  if (last && lastLesson && followed !== last.itemId) {
    setFollowed(last.itemId);
    if (!lastLesson.single) setOpenLesson(lastLesson.key);
  }

  const header = <Stack.Screen options={{ title: t('progress.title') }} />;

  if (loaded === undefined || loaded === null || loaded === 'not_found') {
    return (
      <Screen underHeader centred>
        {header}
        {loaded === undefined ? <LoadingCards /> : null}
        {loaded === 'not_found' ? (
          <Notice tone="info" title={t('myQr.noRecordTitle')}>
            {t('myQr.noRecordBody')}
          </Notice>
        ) : null}
        {loaded === null ? (
          <>
            <Notice tone="error" title={t('progress.loadFailed')}>
              {t('common.networkError')}
            </Notice>
            <Button icon="refresh" label={t('common.tryAgain')} onPress={() => void load()} />
          </>
        ) : null}
        <Button variant="link" icon="home" label={t('comingSoon.back')} onPress={() => router.dismissTo(area === 'me' ? '/staff/me' : '/student')} />
      </Screen>
    );
  }

  const level = levelName(t, loaded.levelId);
  const levelWide = loaded.materials.filter((m) => m.itemId === null);

  return (
    <Screen underHeader onRefresh={load}>
      {/* F9 (#327): a failed refresh keeps what is shown and says so. */}
      <RefreshFailed at={refreshFailed} onRetry={() => load()} />
      {header}
      {/* Continue learning (#787): the chapter opened last, while it is still in the level. */}
      {last && lastLesson ? (
        <ListRow
          leading="play"
          highlight="attention"
          title={t('chapter.continue')}
          details={[lastLesson.single ? last.title : `${lessonTitle(lastLesson)} · ${last.title}`]}
          onPress={() => router.push(chapterHref(area, last.itemId))}
        />
      ) : null}
      <Section icon="level" title={t('home.student.myLevel', { level })} description={t('progress.intro')}>
        {/* The level path (#620): "7 of 20 in Beginner", the next items to learn, the level after. */}
        {loaded.total > 0 ? (
          <LevelPathView path={levelPath(loaded.items, loaded.levelId, LEVEL_IDS)} />
        ) : (
          <AppText tone="muted">{t('profile.noSyllabus')}</AppText>
        )}
      </Section>

      {/* Phase 2 slice 3 (docs/DECISIONS.md #54): weekly practice, opens S6. */}
      <PracticePanel profileId={myId} />

      {levelWide.length > 0 ? (
        <Section icon="library" title={t('progress.levelLessons', { level })}>
          {levelWide.map((material) => (
            <MaterialRow key={material.id} material={material} />
          ))}
        </Section>
      ) : null}

      {loaded.items.length === 0 ? <EmptyState icon="syllabus" title={t('profile.noSyllabus')} /> : null}
      {lessons.map((lesson) => {
        const { done, total } = chaptersDone(lesson);
        if (lesson.single) {
          const item = lesson.chapters[0];
          return (
            <LessonFold
              key={lesson.key}
              title={item.title}
              details={chapterDetails(t, item, loaded.materials)}
              done={item.doneOn !== null}
              onOpen={() => router.push(chapterHref(area, item.id))}
            />
          );
        }
        return (
          <LessonFold
            key={lesson.key}
            title={lessonTitle(lesson)}
            details={[t('chapter.doneCount', { done, total })]}
            done={total > 0 && done === total}
            open={openLesson === lesson.key}
            onToggle={() => setOpenLesson((key) => (key === lesson.key ? null : lesson.key))}>
            {lesson.chapters.map((item, i) => (
              <ListRow
                key={item.id}
                leading={item.doneOn ? 'check' : 'syllabus'}
                highlighted={item.doneOn !== null}
                title={`${i + 1}. ${item.title}`}
                details={chapterDetails(t, item, loaded.materials)}
                onPress={() => router.push(chapterHref(area, item.id))}
              />
            ))}
          </LessonFold>
        );
      })}
    </Screen>
  );
}

/** A chapter's lines: shown in class or not, retired, and what it has (Video · Audio · Notes, as its tabs). */
function chapterDetails(t: TFunction, item: SyllabusEntry, materials: readonly Material[]): string[] {
  const mine = materials.filter((m) => m.itemId === item.id);
  const has = new Set(mine.flatMap((m) => lessonFormats(m)));
  if (item.description || mine.some((m) => m.kind !== 'youtube' && m.kind !== 'video')) has.add('notes');
  const formats = (['video', 'audio', 'notes'] as const).filter((f) => has.has(f)).map((f) => t(`lessonPlayer.tabs.${f}`));
  return [
    item.doneOn ? t('progress.doneOn', { date: formatDate(item.doneOn) }) : t('progress.notYet'),
    ...(item.retired ? [t('progress.retired')] : []),
    ...(formats.length > 0 ? [formats.join(' · ')] : []),
  ];
}
