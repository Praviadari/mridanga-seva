// S1 Student home, simple since 10-10-2026 (docs/DECISIONS.md #240): the saffron header with the
// greeting (components/home-header.tsx), the ring of the student's screens around the
// drum, each circle opening its own screen, so the home fits a phone without scrolling; a drawn
// lotus mandala behind the ring (components/home-art.tsx, #241); under the ring a slim bar of
// my level's syllabus (opens S4) and a fact of the day with a faint temple behind it (#242). What used
// to be cards here lives behind a circle: this week's visits on Attendance (S9), the level and
// syllabus on My progress (S4), the next event and the polls on Events & polls (S11, S12), the
// latest announcements on Announcements (S10). What waits for the student is a count on its circle
// (announcements not opened yet, polls to vote, About you not finished). Only notices stay on the
// home: "A new version is ready" on the Android app (components/update-notice.tsx), notifications off
// (components/push-notice.tsx, #305), could not load, and no student record. Language, Sign out and the version line are on My profile (A3), opened
// by the person button beside the bell in the header.
// Numbers: student_home() through src/data/home.ts; announcements: src/data/announcements.ts.
// It loads again each time it comes back into view, so a count goes once the thing is done. It also
// saves the My QR card on the phone once per run of the app (data/my-student.ts keepMyCardSaved).
// A login that has just become a student sees a welcome card once on this phone in place of the circles (roll
// number, what My QR is for; components/welcome-card.tsx, lib/welcome.ts, #342); About you waits until the next start.
// The level path (#620): the strip says "7 of 20 in Beginner" and the next item to learn. A small celebration (#621-#623)
// stands in place of the circles once per event: an item ticked in class, a practice milestone, a move up a level
// (components/celebration-card.tsx, lib/celebrations.ts). Both come from data/level-path.ts, read after the numbers
// and at most every PATH_EVERY_MS (pull to refresh reads at once), so the ring never waits for them.

import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet } from 'react-native';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { CelebrationCard } from '@/components/celebration-card';
import { FactCard } from '@/components/fact-card';
import { HomeHeader } from '@/components/home-header';
import { ModuleRing, type Module } from '@/components/module-ring';
import { Notice } from '@/components/notice';
import { ProgressBar } from '@/components/progress-bar';
import { Screen } from '@/components/screen';
import { PrivacyNoticeCard } from '@/components/privacy-notice-card';
import { PushNotice } from '@/components/push-notice';
import { UpdateNotice } from '@/components/update-notice';
import { WelcomeCard } from '@/components/welcome-card';
import { fetchMyUnreadCount } from '@/data/announcements';
import { fetchStudentHome, type StudentHome } from '@/data/home';
import { fetchMyPath } from '@/data/level-path';
import { keepMyCardSaved } from '@/data/my-student';
import { fetchPollsToVote } from '@/data/polls';
import { LEVEL_IDS, levelName } from '@/i18n/labels';
import { useAboutPrompt } from '@/lib/about-prompt';
import { celebrationEvents, takeDueCelebrations, type CelebrationEvent } from '@/lib/celebrations';
import { todayLocal } from '@/lib/dates';
import { useLatestLoad } from '@/lib/latest-load';
import { levelPath, type LevelPath } from '@/lib/level-path';
import { milestones } from '@/lib/milestones';
import { useReloadOnResume } from '@/lib/reload-on-resume';
import { markWelcomeSeen, welcomeDue, welcomeSeen } from '@/lib/welcome';

/** The path and celebrations are read again at most this often on coming back to the home (pull to refresh: at once). */
const PATH_EVERY_MS = 2 * 60_000;

/** Student home screen. */
export default function StudentHomeScreen() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const myId = profile?.id ?? '';
  // undefined = loading, null = could not load.
  const [home, setHome] = useState<StudentHome | 'not_found' | null | undefined>(undefined);
  // Unread announcements for the News badge.
  const [unreadCount, setUnreadCount] = useState<number | null | undefined>(undefined);
  const [pollsToVote, setPollsToVote] = useState(0);
  // The welcome, once per login on this phone, for a student who joined lately (#342).
  const [welcomeClosed, setWelcomeClosed] = useState(false);
  const welcome =
    !welcomeClosed && !!myId && !!home && home !== 'not_found' && welcomeDue(welcomeSeen(myId), home.joinedOn, todayLocal());
  // Once the welcome showed, About you does not push itself over it (or over My QR) in this run of the app.
  const [hadWelcome, setHadWelcome] = useState(false);
  if (welcome && !hadWelcome) setHadWelcome(true);
  // About you (step 2 of joining, docs/DECISIONS.md #164): opens by itself once after the first
  // sign-in; while unfinished it is a circle with a mark.
  const aboutOpen = useAboutPrompt(profile?.id, '/student/about-you', home !== undefined && !welcome && !hadWelcome);
  const beginLoad = useLatestLoad();
  // The name on the student record, which staff keep correct, once loaded; until then the name
  // typed at sign-up (FS2-10).
  const name = (home && home !== 'not_found' ? home.fullName.trim() : '') || profile?.full_name.trim();

  // The level path of the strip (#620) and the events to celebrate now (#621); [] = none.
  const [path, setPath] = useState<LevelPath | null>(null);
  const [celebration, setCelebration] = useState<CelebrationEvent[]>([]);
  const pathReadAt = useRef(0);

  const load = useCallback(
    async (refresh = false) => {
      const isNewest = beginLoad();
      // My QR saved on this phone before the student needs it at the door without signal (R1-02, #303).
      void keepMyCardSaved(myId);
      // Only what the ring shows: the badge needs ids and my reads, not posts (P5-06, #330).
      const [loadedHome, loadedUnread, loadedPolls] = await Promise.all([
        fetchStudentHome({ weekStarts: false }),
        fetchMyUnreadCount(myId),
        fetchPollsToVote(),
      ]);
      if (!isNewest()) return; // an older load answering late (D6-19)
      setHome(loadedHome);
      setUnreadCount(loadedUnread);
      setPollsToVote(loadedPolls);

      // Then the path and the celebrations, not more often than PATH_EVERY_MS.
      if (!myId || !loadedHome || loadedHome === 'not_found') return;
      if (!refresh && Date.now() - pathReadAt.current < PATH_EVERY_MS) return;
      const loadedPath = await fetchMyPath(myId);
      if (!isNewest() || !loadedPath) return;
      pathReadAt.current = Date.now();
      setPath(levelPath(loadedPath.items, loadedPath.levelId, LEVEL_IDS));
      // Only with everything read: a part missing would make its old events look new next time.
      if (loadedPath.levelChanges === null || loadedPath.practice === null) return;
      const today = todayLocal();
      // The welcome goes first; its events wait for a later visit to the home.
      if (welcomeDue(welcomeSeen(myId), loadedHome.joinedOn, today)) return;
      const events = celebrationEvents(
        loadedPath.items,
        loadedPath.levelChanges,
        milestones(loadedPath.practice.days, loadedPath.practice.goal, today),
        LEVEL_IDS,
      );
      const due = takeDueCelebrations(myId, events, today);
      if (due.length > 0) setCelebration(due);
    },
    [myId, beginLoad],
  );

  // F9 / R4-04 (#327): back after a while (a phone that slept), the screen loads again.
  useReloadOnResume(load);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const unread = unreadCount ?? 0;

  // The ring of the student's screens (docs/DECISIONS.md #41, #44, #240), in reading order; coloured by family and the
  // circles of a family side by side (UI audit fix 9, #368): blue the door, purple learning, teal practice, orange
  // community, green About you.
  const modules: Module[] = [
    // My QR first: it works without internet (#21), when it is needed most; also a tab.
    { key: 'qr', icon: 'qr', tone: 'blue', label: t('tabs.myQr'), onPress: () => router.push('/student/my-qr') },
    // S9 with this week's visits at the top.
    { key: 'visits', icon: 'visits', tone: 'blue', label: t('visitHistory.module'), onPress: () => router.push('/student/visits') },
    // My level and its syllabus (S4).
    { key: 'progress', icon: 'syllabus', tone: 'purple', label: t('progress.title'), onPress: () => router.push('/student/progress') },
    // Phase 2 (S7, docs/DECISIONS.md #52).
    { key: 'assessments', icon: 'assessment', tone: 'purple', label: t('assessments.title'), onPress: () => router.push('/student/assessments') },
    // Phase 2 slice 3 (S5 Practice tools, docs/DECISIONS.md #54).
    { key: 'practice', icon: 'practice', tone: 'teal', label: t('practice.module'), onPress: () => router.push('/student/practice') },
    {
      key: 'news',
      icon: 'news',
      tone: 'orange',
      // "News", the tab's own word (#353).
      label: t('tabs.news'),
      badge: unread,
      badgeSpoken: t('home.badges.new', { count: unread }),
      onPress: () => router.push('/student/announcements'),
    },
    // Phase 2 slice 5: events and polls (S11, S12; docs/DECISIONS.md #61).
    {
      key: 'events',
      icon: 'events',
      tone: 'orange',
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
    <Screen wide compact header={<HomeHeader name={name} />} onRefresh={() => load(true)}>
      <UpdateNotice />
      <PushNotice place="home" />
      <PrivacyNoticeCard />

      {home === null || unreadCount === null ? (
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

      {welcome ? (
        <WelcomeCard
          name={home.fullName.trim().split(/\s+/)[0] ?? ''}
          rollNo={home.rollNo}
          levelId={home.levelId}
          onShowQr={() => {
            markWelcomeSeen(myId);
            setWelcomeClosed(true);
            router.push('/student/my-qr');
          }}
          onClose={() => {
            markWelcomeSeen(myId);
            setWelcomeClosed(true);
          }}
        />
      ) : celebration.length > 0 ? (
        <CelebrationCard events={celebration} onClose={() => setCelebration([])} />
      ) : (
        <>
          {/* Shown while loading too: every circle opens its screen, which loads on its own. */}
          <ModuleRing modules={modules} />

          {/* Under the ring (#242): my level at a glance (opens S4), and today's fact about the mṛdaṅga. */}
          {home && home !== 'not_found' ? <LevelStrip home={home} path={path} /> : null}
          <FactCard />
        </>
      )}
    </Screen>
  );
}

/**
 * My level and its syllabus as one slim bar, "7 of 20 in Beginner", and the next item to learn once the path is read
 * (#620); a button to My progress (S4).
 */
function LevelStrip({ home, path }: { home: StudentHome; path: LevelPath | null }) {
  const { t } = useTranslation();
  const level = levelName(t, home.levelId);
  const text =
    home.syllabusTotal > 0
      ? t('home.student.levelStrip', { level, done: home.syllabusDone, total: home.syllabusTotal })
      : t('home.student.levelStripNone', { level });
  // The path of another level (moved up since it was read) says nothing here.
  const ownPath = path?.levelId === home.levelId ? path : null;
  const next = ownPath?.next[0];
  const nextText = next ? t('levelPath.next', { title: next.title }) : ownPath?.complete ? t('levelPath.complete', { level }) : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={nextText ? `${text}. ${nextText}` : text}
      onPress={() => router.push('/student/progress')}
      style={({ pressed }) => [styles.strip, pressed && styles.pressed]}>
      <ProgressBar done={home.syllabusDone} total={home.syllabusTotal} label={text} valueText={text} />
      {nextText ? (
        <AppText variant="small" numberOfLines={1}>
          {nextText}
        </AppText>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  strip: {
    minHeight: 48,
    justifyContent: 'center',
    gap: 2,
  },
  pressed: {
    opacity: 0.7,
  },
});