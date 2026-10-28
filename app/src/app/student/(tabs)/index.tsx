// S1 Student home, since 27-10-2026 (docs/DECISIONS.md #673, #674; Sarvesh Prji's student spec, section 2; amends
// the ring of #240): the compact devotional band (components/home-header.tsx: name, motto, "Hare Krishna, name" and
// the Updates bell with its count), then Today's Practice first (components/today-practice-card.tsx: what to
// practise, guna, minutes, today's progress, one big Start / Continue), the Śloka Study shortcut across the row, and
// the secondary cards: Lessons, Assessments (how many wait), My QR, Events (polls to vote), My Growth and, while it is
// not finished, My Details. A fact of the day closes the page (#242). The level strip moved to the Learn tab.
// Only notices stay above the cards: "A new version is ready" on the Android app (components/update-notice.tsx),
// notifications off (components/push-notice.tsx, #305), could not load, and no student record.
// Numbers: student_home() through src/data/home.ts; Today's Practice: data/today-practice.ts.
// It loads again each time it comes back into view, so a count goes once the thing is done. It also
// saves the My QR card on the phone once per run of the app (data/my-student.ts keepMyCardSaved).
// A login that has just become a student sees a welcome card once on this phone in place of the cards (roll
// number, what My QR is for; components/welcome-card.tsx, lib/welcome.ts, #342); About you waits until the next start.
// A small celebration (#621-#623) stands in place of the cards once per event: an item ticked in class, a practice
// milestone, a move up a level (components/celebration-card.tsx, lib/celebrations.ts). It comes from
// data/level-path.ts, read after the numbers and at most every PATH_EVERY_MS (pull to refresh reads at once), so the
// cards never wait for it.

import { router, useFocusEffect } from 'expo-router';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useWindowDimensions, View } from 'react-native';
import { BottomTabBarHeightContext } from 'expo-router/tabs';

import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/button';
import { CelebrationCard } from '@/components/celebration-card';
import { FactCard } from '@/components/fact-card';
import { HomeHeader } from '@/components/home-header';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { PrivacyNoticeCard } from '@/components/privacy-notice-card';
import { PushNotice } from '@/components/push-notice';
import { ModuleRing } from '@/components/module-ring';
import type { Shortcut } from '@/components/shortcut-tiles';
import { TodayPracticeCard } from '@/components/today-practice-card';
import { UpdateNotice } from '@/components/update-notice';
import { WelcomeCard } from '@/components/welcome-card';
import { fetchMyOpenAssessmentCount, fetchStudentHome, type StudentHome } from '@/data/home';
import { fetchMyPath } from '@/data/level-path';
import { keepMyCardSaved } from '@/data/my-student';
import { fetchPollsToVote } from '@/data/polls';
import { fetchTodayPractice } from '@/data/today-practice';
import { LEVEL_IDS } from '@/i18n/labels';
import { useAboutPrompt } from '@/lib/about-prompt';
import { celebrationEvents, takeDueCelebrations, type CelebrationEvent } from '@/lib/celebrations';
import { todayLocal } from '@/lib/dates';
import { useLatestLoad } from '@/lib/latest-load';
import { levelPath } from '@/lib/level-path';
import { milestones } from '@/lib/milestones';
import { useReloadOnResume } from '@/lib/reload-on-resume';
import type { TodayPractice } from '@/lib/today-practice';
import { markWelcomeSeen, welcomeDue, welcomeSeen } from '@/lib/welcome';

/** The path and celebrations are read again at most this often on coming back to the home (pull to refresh: at once). */
const PATH_EVERY_MS = 2 * 60_000;

/** PREVIEW: the space under the bottom circle for its label, and the fact card's height until measured. */
const LABEL_BELOW = 36;
const FACT_GUESS = 104;
/** PREVIEW: the ring keeps the fact of the day only while it can still be this big with it. */
const RING_WITH_FACT = 300;
/** PREVIEW: never smaller than this (a very short window scrolls rather than squeeze the circles together). */
const RING_MIN = 260;

/** Student home screen. */
export default function StudentHomeScreen() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const myId = profile?.id ?? '';
  // undefined = loading, null = could not load.
  const [home, setHome] = useState<StudentHome | 'not_found' | null | undefined>(undefined);
  const [pollsToVote, setPollsToVote] = useState(0);
  const [assessmentsOpen, setAssessmentsOpen] = useState(0);
  const [today, setToday] = useState<TodayPractice | null>(null);
  // The welcome, once per login on this phone, for a student who joined lately (#342).
  const [welcomeClosed, setWelcomeClosed] = useState(false);
  const welcome =
    !welcomeClosed && !!myId && !!home && home !== 'not_found' && welcomeDue(welcomeSeen(myId), home.joinedOn, todayLocal());
  // Once the welcome showed, About you does not push itself over it (or over My QR) in this run of the app.
  const [hadWelcome, setHadWelcome] = useState(false);
  if (welcome && !hadWelcome) setHadWelcome(true);
  // About you (step 2 of joining, docs/DECISIONS.md #164): opens by itself once after the first
  // sign-in; while unfinished it is a card with a mark.
  const aboutOpen = useAboutPrompt(profile?.id, '/student/about-you', home !== undefined && !welcome && !hadWelcome);
  const beginLoad = useLatestLoad();
  // The name on the student record, which staff keep correct, once loaded; until then the name
  // typed at sign-up (FS2-10).
  const name = (home && home !== 'not_found' ? home.fullName.trim() : '') || profile?.full_name.trim();

  // The events to celebrate now (#621); [] = none. The next item to learn, for Today's Practice without a plan.
  const [celebration, setCelebration] = useState<CelebrationEvent[]>([]);
  const nextTitle = useRef<string | null>(null);
  const pathReadAt = useRef(0);

  const load = useCallback(
    async (refresh = false) => {
      const isNewest = beginLoad();
      // My QR saved on this phone before the student needs it at the door without signal (R1-02, #303).
      void keepMyCardSaved(myId);
      // Today's Practice on its own: the cards never wait for it.
      void fetchTodayPractice(myId, nextTitle.current).then((loaded) => {
        if (isNewest() && loaded) setToday(loaded);
      });
      // Only what the cards show: counts, not lists (P5-06, #330).
      const [loadedHome, loadedPolls, loadedAssessments] = await Promise.all([
        fetchStudentHome({ weekStarts: false }),
        fetchPollsToVote(),
        fetchMyOpenAssessmentCount(),
      ]);
      if (!isNewest()) return; // an older load answering late (D6-19)
      setHome(loadedHome);
      setPollsToVote(loadedPolls);
      setAssessmentsOpen(loadedAssessments ?? 0);

      // Then the path and the celebrations, not more often than PATH_EVERY_MS.
      if (!myId || !loadedHome || loadedHome === 'not_found') return;
      if (!refresh && Date.now() - pathReadAt.current < PATH_EVERY_MS) return;
      const loadedPath = await fetchMyPath(myId);
      if (!isNewest() || !loadedPath) return;
      pathReadAt.current = Date.now();
      const path = levelPath(loadedPath.items, loadedPath.levelId, LEVEL_IDS);
      nextTitle.current = path.next[0]?.title ?? null;
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

  // Śloka Study stands out across the row (#674): Ishtagoshti was a tab until #670.
  const sloka: Shortcut[] = [
    {
      key: 'ishtagoshti',
      icon: 'ishtagoshti',
      tone: 'orange',
      label: t('tabs.ishtagoshti'),
      detail: t('home.student.slokaDetail'),
      onPress: () => router.push('/student/ishtagoshti'),
    },
  ];
  // The secondary cards (#674), coloured by family and the cards of a family side by side (UI audit fix 9, #368):
  // purple learning, blue the door, orange community, teal practice, green About you.
  const shortcuts: Shortcut[] = [
    { key: 'lessons', icon: 'syllabus', tone: 'purple', label: t('home.student.lessons'), onPress: () => router.push('/student/progress') },
    {
      key: 'assessments',
      icon: 'assessment',
      tone: 'purple',
      label: t('assessments.title'),
      badge: assessmentsOpen,
      badgeSpoken: t('home.badges.toDo', { count: assessmentsOpen }),
      onPress: () => router.push('/student/assessments'),
    },
    // My QR works without internet (#21), when it is needed most.
    { key: 'qr', icon: 'qr', tone: 'blue', label: t('tabs.myQr'), onPress: () => router.push('/student/my-qr') },
    // Events and polls (S11, S12; docs/DECISIONS.md #61).
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
    // My Growth: the practice weeks and milestones (S6).
    { key: 'growth', icon: 'promote', tone: 'teal', label: t('home.student.growth'), onPress: () => router.push('/student/practice-log') },
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
          } satisfies Shortcut,
        ]
      : []),
  ];

  // PREVIEW: the ring in reading order, families side by side (#368): blue, purple, teal, orange, green.
  const byKey = new Map([...sloka, ...shortcuts].map((s) => [s.key, s]));
  // The ring sized to the space between the card and the tabs, so the home never scrolls (Praveen 28-10-2026).
  // At least the bar's own 60 px (theme/use-theme.ts): it reads 49, the library's guess, until the bar is measured.
  const tabBar = Math.max(useContext(BottomTabBarHeightContext) ?? 0, 60);
  const { height: windowHeight } = useWindowDimensions();
  const ringBox = useRef<View>(null);
  const [ringTop, setRingTop] = useState<number | null>(null);
  const [factHeight, setFactHeight] = useState(FACT_GUESS);
  // Where the ring starts on the screen: again when the card above it or the band changes height (the web tells a
  // view only that its own size changed, not that it moved).
  const measureRing = useCallback(() => {
    ringBox.current?.measureInWindow((_x, y) => setRingTop((was) => (was !== null && Math.abs(was - y) < 1 ? was : y)));
  }, []);
  useEffect(() => {
    const timer = setTimeout(measureRing, 50);
    return () => clearTimeout(timer);
  }, [measureRing, home, today, name]);
  const room = ringTop === null ? null : windowHeight - tabBar - ringTop - 8;
  const withFact = room === null || room - factHeight - 8 - LABEL_BELOW >= RING_WITH_FACT;
  const ringMax = room === null ? undefined : Math.max(RING_MIN, room - LABEL_BELOW - (withFact ? factHeight + 8 : 0));
  const ring = ['qr', 'lessons', 'assessments', 'growth', 'ishtagoshti', 'events', 'about'].flatMap((k) => byKey.get(k) ?? []);

  return (
    <Screen wide compact header={<HomeHeader name={name} student onMe={() => router.navigate('/student/me')} />} onRefresh={() => load(true)}>
      <UpdateNotice />
      <PushNotice place="home" />
      <PrivacyNoticeCard />

      {home === null ? (
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
          {/* Shown while loading too: Start opens the practice tools, which load on their own. */}
          {home !== 'not_found' ? (
            <View onLayout={measureRing}>
              <TodayPracticeCard today={today} slim />
            </View>
          ) : null}
          {/* PREVIEW 28-10-2026 (Praveen): the ring of #240 back under the Daily Mission, in place of the cards. */}
          <View
            ref={ringBox}
            onLayout={measureRing}>
            <ModuleRing modules={ring} maxSize={ringMax} />
          </View>
          {withFact ? (
            <View onLayout={(e) => setFactHeight(Math.round(e.nativeEvent.layout.height))}>
              <FactCard />
            </View>
          ) : null}
        </>
      )}
    </Screen>
  );
}
