// S10 Announcements, for students: the announcements addressed to them, pinned ones first, then
// newest first, with who posted each one; "New" marks those not opened yet and "Edited" those
// changed after publishing. Tapping one opens it (./[id].tsx), which tells the coordinator it was
// seen. Scheduled announcements appear only from their time; the database decides which ones a
// student sees (docs/DECISIONS.md #25). Data: src/data/announcements.ts.

import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
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
import { audienceName, authorLine } from '@/i18n/labels';
import { formatDateTimeInIndia } from '@/lib/dates';

/** One card per announcement addressed to the student. */
export default function MyAnnouncementsScreen() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const myId = profile?.id ?? '';
  // undefined = loading, null = could not load.
  const [loaded, setLoaded] = useState<MyAnnouncementList | null | undefined>(undefined);

  const load = useCallback(async () => {
    setLoaded(await fetchMyAnnouncements(myId));
  }, [myId]);

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
          details={[
            `${formatDateTimeInIndia(a.publishAt)} · ${audienceName(t, a, {
              groupName: a.audienceGroup !== null ? loaded.groupNames.get(a.audienceGroup) : null,
            })}`,
            ...authorLine(t, a.createdBy ? loaded.staffNames.get(a.createdBy) : undefined),
            ...(a.editedAt ? [t('announcements.edited', { date: formatDateTimeInIndia(a.editedAt) })] : []),
            ...(a.attachments.length > 0 ? [t('announcements.files.count', { number: a.attachments.length })] : []),
          ]}
          onPress={() => router.push({ pathname: '/student/announcements/[id]', params: { id: String(a.id) } })}
        />
      ))}
      </Columns>
    </Screen>
  );
}
