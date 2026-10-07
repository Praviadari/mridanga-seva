// A2 Notifications inbox, for every role (routes student/notifications.tsx and
// staff/notifications.tsx): the notices this person was sent, newest first, "New" on the unread
// ones, "Mark all read" at the top. Tapping one marks it read and opens the screen its push would
// open (the announcement). Opened from the bell on the home header and from the account card at the
// foot of every home. Data: src/data/notifications.ts (docs/DECISIONS.md #49).

import { router, Stack, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-provider';
import { AnnouncementCard } from '@/components/announcement-card';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { LoadingCards } from '@/components/loading-cards';
import { Notice as NoticeBox } from '@/components/notice';
import { Screen } from '@/components/screen';
import {
  fetchInbox,
  markNoticesRead,
  noticeIcon,
  noticeTarget,
  NOTICES_PER_PAGE,
  type Notice,
} from '@/data/notifications';
import { formatDateTime } from '@/lib/dates';

type Loaded = { notices: Notice[]; hasOlder: boolean };

/** The inbox. */
export function NotificationsScreen() {
  const { t } = useTranslation();
  const { area } = useAuth();
  // undefined = loading, null = could not load.
  const [loaded, setLoaded] = useState<Loaded | null | undefined>(undefined);
  const [limit, setLimit] = useState(NOTICES_PER_PAGE);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error' | 'info'; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoaded(await fetchInbox(limit));
  }, [limit]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const unread = loaded ? loaded.notices.filter((n) => n.readAt === null).length : 0;

  async function markAll() {
    setBusy(true);
    setMessage(null);
    const ok = await markNoticesRead();
    setBusy(false);
    if (!ok) setMessage({ tone: 'error', text: t('inbox.markFailed') });
    await load();
  }

  async function open(notice: Notice) {
    const target = noticeTarget(notice, area);
    if (!target) {
      setMessage({ tone: 'info', text: t('inbox.notInThisVersion') });
      return;
    }
    // The announcement's screen marks it read too (its read receipt); this covers any other kind.
    if (notice.readAt === null) void markNoticesRead([notice.id]);
    router.push(target as Href);
  }

  const header = <Stack.Screen options={{ title: t('inbox.title') }} />;

  if (loaded === null) {
    return (
      <Screen underHeader centred>
        {header}
        <NoticeBox tone="error" title={t('inbox.loadFailed')}>
          {t('common.networkError')}
        </NoticeBox>
        <Button icon="refresh" label={t('common.tryAgain')} onPress={() => void load()} />
      </Screen>
    );
  }

  return (
    <Screen underHeader onRefresh={load}>
      {header}
      <AppText tone="muted">{t('inbox.intro')}</AppText>
      {loaded === undefined ? <LoadingCards /> : null}
      {loaded ? (
        <>
          <AppText variant="label" role="status">
            {unread > 0 ? t('inbox.unreadCount', { count: unread }) : t('inbox.allRead')}
          </AppText>
          {unread > 0 ? (
            <Button variant="secondary" icon="check" label={t('inbox.markAll')} loading={busy} onPress={() => void markAll()} />
          ) : null}
          {message ? <NoticeBox tone={message.tone}>{message.text}</NoticeBox> : null}
          {loaded.notices.length === 0 ? <EmptyState icon="bell" title={t('inbox.empty')} /> : null}
          {loaded.notices.map((notice) => (
            <AnnouncementCard
              key={notice.id}
              icon={noticeIcon(notice.kind)}
              title={notice.title}
              body={notice.body}
              pinned={false}
              unread={notice.readAt === null}
              details={[formatDateTime(notice.visibleAt)]}
              onPress={() => void open(notice)}
            />
          ))}
          {loaded.hasOlder ? (
            <Button variant="secondary" label={t('inbox.showOlder')} onPress={() => setLimit(limit + NOTICES_PER_PAGE)} />
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
