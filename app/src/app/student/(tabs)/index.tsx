// S1 Student home: the saffron header with the greeting (components/home-header.tsx), a large
// button to My QR (S3), this week's visits and the last visit, the student's level with their
// syllabus progress, and the latest announcements with the ones not opened yet marked "New"
// (S10), then the language switch, Sign out and the app version (components/account-footer.tsx).
// On the Android app, "A new version is ready" shows under the greeting once an update is
// downloaded (components/update-notice.tsx). Read-only.
// Numbers: student_home() through src/data/home.ts; announcements: src/data/announcements.ts.
// It loads again each time it comes back into view, so "New" goes once an announcement is opened.

import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-provider';
import { AccountFooter } from '@/components/account-footer';
import { AnnouncementCard } from '@/components/announcement-card';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { HomeHeader } from '@/components/home-header';
import { LoadingCards } from '@/components/loading-cards';
import { ModuleRing, type Module } from '@/components/module-ring';
import { Notice } from '@/components/notice';
import { ProgressBar } from '@/components/progress-bar';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { StatGrid, StatTile } from '@/components/stat-tile';
import { UpdateNotice } from '@/components/update-notice';
import { fetchMyAnnouncements, type MyAnnouncementList } from '@/data/announcements';
import { fetchStudentHome, type StudentHome } from '@/data/home';
import { audienceName, authorLine, lastVisitText, levelName } from '@/i18n/labels';
import { formatDateTimeInIndia } from '@/lib/dates';

/** How many announcements the home shows; the rest are one tap away on S10. */
const LATEST_COUNT = 3;

/** Student home screen. */
export default function StudentHomeScreen() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const myId = profile?.id ?? '';
  const name = profile?.full_name.trim();
  // undefined = loading, null = could not load.
  const [home, setHome] = useState<StudentHome | 'not_found' | null | undefined>(undefined);
  const [news, setNews] = useState<MyAnnouncementList | null | undefined>(undefined);

  const load = useCallback(async () => {
    const [loadedHome, loadedNews] = await Promise.all([fetchStudentHome(), fetchMyAnnouncements(myId)]);
    setHome(loadedHome);
    setNews(loadedNews);
  }, [myId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const unread = news ? news.announcements.filter((a) => !a.readByMe).length : 0;

  // The ring of the student's screens (docs/DECISIONS.md #41, #44): the three tabs' subjects plus My
  // progress (S4), Assessments (S7, Phase 2), My attendance (S9) and My profile (A3), and Events as
  // the one module not built yet.
  const modules: Module[] = [
    { key: 'qr', icon: 'qr', tone: 'blue', label: t('tabs.myQr'), onPress: () => router.push('/student/my-qr') },
    { key: 'news', icon: 'news', tone: 'orange', label: t('announcements.title'), onPress: () => router.push('/student/announcements') },
    { key: 'progress', icon: 'syllabus', tone: 'purple', label: t('progress.title'), onPress: () => router.push('/student/progress') },
    // Phase 2 (S7, docs/DECISIONS.md #43); indigo here, as My attendance next to it is teal.
    { key: 'assessments', icon: 'assessment', tone: 'indigo', label: t('assessments.title'), onPress: () => router.push('/student/assessments') },
    { key: 'visits', icon: 'visits', tone: 'teal', label: t('visitHistory.module'), onPress: () => router.push('/student/visits') },
    { key: 'profile', icon: 'profile', tone: 'green', label: t('myProfile.title'), onPress: () => router.push('/student/profile') },
    {
      key: 'events',
      icon: 'events',
      label: t('modules.events'),
      soon: true,
      onPress: () => router.push({ pathname: '/student/coming-soon', params: { module: 'events' } }),
    },
  ];

  return (
    <Screen wide header={<HomeHeader name={name} />} onRefresh={load}>
      <UpdateNotice />

      {/* First and always there, even when nothing else loads: My QR keeps a copy on the phone
          and works without internet (docs/DECISIONS.md #21), which is when it is needed most. */}
      <Button size="large" icon="qr" label={t('myQr.open')} onPress={() => router.push('/student/my-qr')} />

      {home === undefined ? <LoadingCards kind="tiles" /> : null}
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

      {home && home !== 'not_found' ? (
        <>
          <StatGrid>
            <StatTile icon="visits" value={String(home.visitsThisWeek)} label={t('home.student.visitsThisWeek')} />
            <StatTile
              icon="time"
              // Never came: no number of days to show; the line below says "No visit yet".
              value={home.lastVisitAt ? String(home.daysSinceVisit) : '—'}
              label={t('home.student.daysSinceVisit')}
            />
          </StatGrid>
          <AppText variant="small" tone="muted">
            {lastVisitText(t, home)}
          </AppText>

          <Section icon="level" title={t('home.student.myLevel', { level: levelName(t, home.levelId) })}>
            {home.syllabusTotal > 0 ? (
              <ProgressBar
                done={home.syllabusDone}
                total={home.syllabusTotal}
                label={t('syllabus.progressLabel', { level: levelName(t, home.levelId) })}
                valueText={t('profile.syllabusDone', { done: home.syllabusDone, total: home.syllabusTotal })}
              />
            ) : (
              <AppText tone="muted">{t('profile.noSyllabus')}</AppText>
            )}
            <Button variant="link" icon="syllabus" label={t('progress.open')} onPress={() => router.push('/student/progress')} />
          </Section>
        </>
      ) : null}

      <ModuleRing title={t('home.staff.shortcuts')} modules={modules} />

      {news ? (
        <Section
          icon="news"
          title={t('announcements.title')}
          description={unread > 0 ? t('home.student.unread', { count: unread }) : undefined}>
          {news.announcements.length === 0 ? (
            <EmptyState icon="news" title={t('announcements.emptyStudent')} />
          ) : null}
          {/* Same order as S10: pinned first, then newest. */}
          {news.announcements.slice(0, LATEST_COUNT).map((a) => (
            <AnnouncementCard
              key={a.id}
              title={a.title}
              body={a.body}
              pinned={a.pinned}
              unread={!a.readByMe}
              details={[
                `${formatDateTimeInIndia(a.publishAt)} · ${audienceName(t, a, {
                  groupName: a.audienceGroup !== null ? news.groupNames.get(a.audienceGroup) : null,
                })}`,
                ...authorLine(t, a.createdBy ? news.staffNames.get(a.createdBy) : undefined),
              ]}
              onPress={() => router.push({ pathname: '/student/announcements/[id]', params: { id: String(a.id) } })}
            />
          ))}
          <Button
            variant="secondary"
            label={t('home.student.allAnnouncements')}
            onPress={() => router.push('/student/announcements')}
          />
        </Section>
      ) : null}

      <AccountFooter />
    </Screen>
  );
}
