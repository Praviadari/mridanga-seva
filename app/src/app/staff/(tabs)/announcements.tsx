// C15 Announcements, for coordinators and the Guru: every announcement, pinned ones first, then
// newest first, with who it is for, who posted it, when students see it, whether it was edited,
// "seen by N of M" and, for the author and the Guru, how many private replies it has.
// "New announcement" opens the compose screen (./new.tsx); tapping one opens it (./[id].tsx) with
// the list of who has not seen it yet. Staff see every announcement, scheduled ones too.
// Data: src/data/announcements.ts.

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
import { fetchStaffAnnouncements, isScheduled, type StaffAnnouncementList } from '@/data/announcements';
import { audienceName } from '@/i18n/labels';
import { formatDateTime } from '@/lib/dates';

/** The "New announcement" button and one card per announcement. */
export default function StaffAnnouncementsScreen() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const myId = profile?.id ?? '';
  // undefined = loading, null = could not load.
  const [loaded, setLoaded] = useState<StaffAnnouncementList | null | undefined>(undefined);

  const load = useCallback(async () => {
    setLoaded(await fetchStaffAnnouncements(myId));
  }, [myId]);

  // Reload whenever the screen comes back into view: after posting, pinning or deleting, and to
  // show the latest seen counts.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const header = <Stack.Screen options={{ title: t('announcements.title') }} />;
  const newButton = (
    <Button icon="add" label={t('announcements.new')} onPress={() => router.push('/staff/announcements/new')} />
  );

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
      {newButton}
      {loaded === undefined ? <LoadingCards /> : null}
      {loaded && loaded.announcements.length === 0 ? (
        <EmptyState icon="news" title={t('announcements.empty')} />
      ) : null}
      <Columns>
      {loaded?.announcements.map((a) => {
        const byMe = a.createdBy === myId;
        const authorName = a.createdBy ? loaded.staffNames.get(a.createdBy) : undefined;
        const when = formatDateTime(a.publishAt);
        const seen = a.seenCount;
        return (
          <AnnouncementCard
            key={a.id}
            title={a.title}
            body={a.body}
            pinned={a.pinned}
            // "New" only for someone else's announcement that this person has not opened yet.
            unread={!byMe && !a.readByMe}
            details={[
              audienceName(t, a, {
                groupName: a.audienceGroup !== null ? loaded.groupNames.get(a.audienceGroup) : null,
                authorName,
                byMe,
              }),
              `${isScheduled(a) ? t('announcements.scheduledFor', { date: when }) : when}${
                authorName ? ` · ${t('announcements.postedBy', { name: authorName })}` : ''
              }`,
              ...(a.editedAt ? [t('announcements.edited', { date: formatDateTime(a.editedAt) })] : []),
              ...(a.attachments.length > 0 ? [t('announcements.files.count', { number: a.attachments.length })] : []),
              ...(seen
                ? [
                    [
                      t('announcements.seenCount', { seen: seen.seen, addressed: seen.addressed }),
                      ...(seen.noLogin > 0 ? [t('announcements.noLoginCount', { number: seen.noLogin })] : []),
                      // Only the author and the Guru get a count of everyone's replies (0008).
                      ...(seen.replies > 0 ? [t('announcements.replyCount', { number: seen.replies })] : []),
                    ].join(' · '),
                  ]
                : []),
            ]}
            onPress={() => router.push({ pathname: '/staff/announcements/[id]', params: { id: String(a.id) } })}
          />
        );
      })}
      </Columns>
    </Screen>
  );
}
