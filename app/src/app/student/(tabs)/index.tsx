// S1 Student home, simple since 10-10-2026 (docs/DECISIONS.md #240): the saffron header with the
// greeting (components/home-header.tsx), the ring of the student's screens around the
// drum, each circle opening its own screen, so the home fits a phone without scrolling; a drawn
// lotus mandala behind the ring (components/home-art.tsx, #241); under the ring a slim bar of
// my level's syllabus (opens S4) and a fact of the day with a faint temple behind it (#242). What used
// to be cards here lives behind a circle: this week's visits on Attendance (S9), the level and
// syllabus on My progress (S4), the next event and the polls on Events & polls (S11, S12), the
// latest announcements on Announcements (S10). What waits for the student is a count on its circle
// (announcements not opened yet, polls to vote, About you not finished). Only notices stay on the
// home: "A new version is ready" on the Android app (components/update-notice.tsx), could not load,
// and no student record. Language, Sign out and the version line are on My profile (A3), opened
// by the person button beside the bell in the header.
// Numbers: student_home() through src/data/home.ts; announcements: src/data/announcements.ts.
// It loads again each time it comes back into view, so a count goes once the thing is done.

import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet } from 'react-native';

import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/button';
import { FactCard } from '@/components/fact-card';
import { HomeHeader } from '@/components/home-header';
import { ModuleRing, type Module } from '@/components/module-ring';
import { Notice } from '@/components/notice';
import { ProgressBar } from '@/components/progress-bar';
import { Screen } from '@/components/screen';
import { UpdateNotice } from '@/components/update-notice';
import { fetchMyLatestAnnouncements, type MyLatestAnnouncements } from '@/data/announcements';
import { fetchStudentHome, type StudentHome } from '@/data/home';
import { fetchPollsToVote } from '@/data/polls';
import { levelName } from '@/i18n/labels';
import { useAboutPrompt } from '@/lib/about-prompt';
import { useLatestLoad } from '@/lib/latest-load';

/** Student home screen. */
export default function StudentHomeScreen() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const myId = profile?.id ?? '';
  // undefined = loading, null = could not load.
  const [home, setHome] = useState<StudentHome | 'not_found' | null | undefined>(undefined);
  const [news, setNews] = useState<MyLatestAnnouncements | null | undefined>(undefined);
  const [pollsToVote, setPollsToVote] = useState(0);
  // About you (step 2 of joining, docs/DECISIONS.md #164): opens by itself once after the first
  // sign-in; while unfinished it is a circle with a mark.
  const aboutOpen = useAboutPrompt(profile?.id, '/student/about-you');
  const beginLoad = useLatestLoad();
  // The name on the student record, which staff keep correct, once loaded; until then the name
  // typed at sign-up (FS2-10).
  const name = (home && home !== 'not_found' ? home.fullName.trim() : '') || profile?.full_name.trim();

  const load = useCallback(async () => {
    const isNewest = beginLoad();
    // One announcement is enough: only the unread count is shown here.
    const [loadedHome, loadedNews, loadedPolls] = await Promise.all([
      fetchStudentHome(),
      fetchMyLatestAnnouncements(myId, 1),
      fetchPollsToVote(),
    ]);
    if (!isNewest()) return; // an older load answering late (D6-19)
    setHome(loadedHome);
    setNews(loadedNews);
    setPollsToVote(loadedPolls);
  }, [myId, beginLoad]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const unread = news ? news.unread : 0;

  // The ring of the student's screens (docs/DECISIONS.md #41, #44, #240), in reading order.
  const modules: Module[] = [
    // My QR first: it works without internet (#21), when it is needed most; also a tab.
    { key: 'qr', icon: 'qr', tone: 'blue', label: t('tabs.myQr'), onPress: () => router.push('/student/my-qr') },
    {
      key: 'news',
      icon: 'news',
      tone: 'orange',
      label: t('announcements.title'),
      badge: unread,
      badgeSpoken: t('home.badges.new', { count: unread }),
      onPress: () => router.push('/student/announcements'),
    },
    // My level and its syllabus (S4).
    { key: 'progress', icon: 'syllabus', tone: 'purple', label: t('progress.title'), onPress: () => router.push('/student/progress') },
    // Phase 2 (S7, docs/DECISIONS.md #52); indigo here, as My attendance next to it is teal.
    { key: 'assessments', icon: 'assessment', tone: 'indigo', label: t('assessments.title'), onPress: () => router.push('/student/assessments') },
    // Phase 2 slice 3 (S5 Practice tools, docs/DECISIONS.md #54).
    { key: 'practice', icon: 'practice', tone: 'pink', label: t('practice.module'), onPress: () => router.push('/student/practice') },
    // S9 with this week's visits at the top.
    { key: 'visits', icon: 'visits', tone: 'teal', label: t('visitHistory.module'), onPress: () => router.push('/student/visits') },
    // Phase 2 slice 5: events and polls (S11, S12; docs/DECISIONS.md #61).
    {
      key: 'events',
      icon: 'events',
      tone: 'purple',
      label: t('events.module'),
      badge: pollsToVote,
      badgeSpoken: t('home.badges.toVote', { count: pollsToVote }),
      onPress: () =>
        router.push(pollsToVote > 0 ? { pathname: '/student/events', params: { tab: 'polls' } } : '/student/events'),
    },
    ...(aboutOpen
      ? [
          {
            key: 'about',
            icon: 'about',
            tone: 'green',
            label: t('about.cardTitle'),
            badge: 1,
            badgeSpoken: t('home.badges.notFinished'),
            onPress: () => router.push('/student/about-you'),
          } satisfies Module,
        ]
      : []),
  ];

  return (
    <Screen wide header={<HomeHeader name={name} />} onRefresh={load}>
      <UpdateNotice />

      {home === null || news === null ? (
        <>
          <Notice tone="error" title={t('home.loadFailed')}>
            {t('common.networkError')}
          </Notice>
          <Button variant="secondary" icon="refresh" label={t('common.tryAgain')} onPress={() => void load()} />
        </>
      ) : null}
      {home === 'not_found' ? (
        <Notice tone="info" title={t('myQr.noRecordTitle')}>
          {t('myQr.noRecordBody')}
        </Notice>
      ) : null}

      {/* Shown while loading too: every circle opens its screen, which loads on its own. */}
      <ModuleRing modules={modules} />

      {/* Under the ring (#242): my level at a glance (opens S4), and today's fact about the mṛdaṅga. */}
      {home && home !== 'not_found' ? <LevelStrip home={home} /> : null}
      <FactCard />
    </Screen>
  );
}

/** My level and its syllabus as one slim bar; a button to My progress (S4). */
function LevelStrip({ home }: { home: StudentHome }) {
  const { t } = useTranslation();
  const level = levelName(t, home.levelId);
  const text =
    home.syllabusTotal > 0
      ? t('home.student.levelStrip', { level, done: home.syllabusDone, total: home.syllabusTotal })
      : t('home.student.levelStripNone', { level });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={text}
      onPress={() => router.push('/student/progress')}
      style={({ pressed }) => [styles.strip, pressed && styles.pressed]}>
      <ProgressBar done={home.syllabusDone} total={home.syllabusTotal} label={text} valueText={text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  strip: {
    minHeight: 48,
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
});