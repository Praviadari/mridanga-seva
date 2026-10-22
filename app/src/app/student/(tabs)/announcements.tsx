// S10 Announcements, for students: the announcements addressed to them, pinned ones first, then
// newest first, with when and who posted each one; "New" marks those not opened yet. Who it is for,
// edits and files are on its own screen. Tapping one opens it (./[id].tsx), which tells the coordinator it was
// seen. Scheduled announcements appear only from their time; the database decides which ones a
// student sees (docs/DECISIONS.md #25). Data: src/data/announcements.ts.

import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-provider';
import { AnnouncementCard } from '@/components/announcement-card';
import { Button } from '@/components/button';
import { Columns } from '@/components/columns';
import { EmptyState } from '@/components/empty-state';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { fetchMyAnnouncements, type MyAnnouncementList } from '@/data/announcements';
import { authorLine } from '@/i18n/labels';
import { formatDateTime } from '@/lib/dates';
import { RefreshFailed } from '@/components/refresh-failed';
import { useKeptLoad } from '@/lib/kept-load';

/** One card per announcement addressed to the student. */
export default function MyAnnouncementsScreen() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const myId = profile?.id ?? '';
  // undefined = loading, null = could not load.
  const [loaded, setLoaded, refreshFailed] = useKeptLoad<MyAnnouncementList | null | undefined>();

  const load = useCallback(async () => {
    setLoaded(await fetchMyAnnouncements(myId));
  }, [myId, setLoaded]);

  // Reload when coming back from an announcement, so its "New" badge goes.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const header = <Stack.Screen options={{ title: t('announcements.title') }} />;

  if (loaded === null) {
    return (
      <Screen underHeader centred>
        {header}
        <Notice tone="error" title={t('announcements.loadFailed')}>
          {t('common.networkError')}
        </Notice>
        <Button icon="refresh" label={t('common.tryAgain')} onPress={() => void load()} />
      </Screen>
    );
  }

  return (
    <Screen underHeader wide onRefresh={load}>
      {/* F9 (#327): a failed refresh keeps what is shown and says so. */}
      <RefreshFailed at={refreshFailed} onRetry={() => load()} />
      {header}
      {loaded === undefined ? <LoadingCards /> : null}
      {loaded && loaded.announcements.length === 0 ? (
        <EmptyState icon="news" title={t('announcements.emptyStudent')} />
      ) : null}
      <Columns>
      {loaded?.announcements.map((a) => (
        <AnnouncementCard
          key={a.id}
          title={a.title}
          body={a.body}
          pinned={a.pinned}
          unread={!a.readByMe}
          // One short line: when and who posted it; who it is for, edits and files are on the announcement's
          // own screen (UI audit fix 5, docs/DECISIONS.md #365).
          details={[
            [formatDateTime(a.publishAt), ...authorLine(t, a.createdBy ? loaded.staffNames.get(a.createdBy) : undefined)].join(' · '),
          ]}
          onPress={() => router.push({ pathname: '/student/announcements/[id]', params: { id: String(a.id) } })}
        />
      ))}
      </Columns>
    </Screen>
  );
}
