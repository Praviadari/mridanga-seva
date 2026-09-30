// S10 One announcement, for its reader: the whole message, when it was published and who it is
// for. Opening it saves the read receipt, so the coordinator's "seen by" count goes up
// (docs/DECISIONS.md #25). Replying to the coordinator comes later.
// Data: src/data/announcements.ts.

import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { fetchAnnouncement, markRead, type Announcement } from '@/data/announcements';
import { audienceName } from '@/i18n/labels';
import { formatDateTimeInIndia } from '@/lib/dates';

/** What the screen loaded: the announcement, and its group's name for a group audience. */
type Loaded = { announcement: Announcement; groupName: string | null };

/** The announcement's title, message and details. */
export default function MyAnnouncementScreen() {
  const { t } = useTranslation();
  const { id: idParam } = useLocalSearchParams<{ id: string }>();
  const id = Number(idParam);
  // undefined = loading, null = could not load, 'not_found' = not there or not addressed to me.
  const [loaded, setLoaded] = useState<Loaded | 'not_found' | null | undefined>(undefined);
  // True once the read receipt went out, so coming back to the screen does not send it again.
  const receiptSent = useRef(false);

  const load = useCallback(async () => {
    const result = await fetchAnnouncement(id);
    setLoaded(result);
    // The receipt is saved only once the text is on the screen, so "seen" means it was shown.
    if (result && result !== 'not_found' && !receiptSent.current) {
      receiptSent.current = await markRead(id);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const header = <Stack.Screen options={{ title: t('announcements.detail.title') }} />;

  if (loaded === undefined || loaded === null || loaded === 'not_found') {
    return (
      <Screen underHeader centred>
        {header}
        {loaded === undefined ? <AppText tone="muted">{t('common.loading')}</AppText> : null}
        {loaded === 'not_found' ? (
          <>
            <Notice tone="error">{t('announcements.detail.notFound')}</Notice>
            <Button
              label={t('announcements.detail.back')}
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/student/announcements'))}
            />
          </>
        ) : null}
        {loaded === null ? (
          <>
            <Notice tone="error" title={t('announcements.loadFailed')}>
              {t('common.networkError')}
            </Notice>
            <Button label={t('common.tryAgain')} onPress={() => void load()} />
          </>
        ) : null}
      </Screen>
    );
  }

  const { announcement: a, groupName } = loaded;
  return (
    <Screen underHeader>
      {header}
      {a.pinned ? (
        <AppText variant="label" tone="primary">
          {t('announcements.pinned')}
        </AppText>
      ) : null}
      <AppText variant="subtitle">{a.title}</AppText>
      <AppText selectable>{a.body}</AppText>
      <AppText tone="muted">
        {`${formatDateTimeInIndia(a.publishAt)} · ${audienceName(t, a, { groupName })}`}
      </AppText>
    </Screen>
  );
}
