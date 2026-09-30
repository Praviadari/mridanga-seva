// S10 One announcement, for its reader: the whole message with its photos and PDFs (opened
// through links that work for an hour, docs/DECISIONS.md #32), when it was published, who posted
// it and who it is for, and "Edited" when it was changed after publishing. Opening it saves the read
// receipt, so the coordinator's "seen by" count goes up (docs/DECISIONS.md #25). Under it the
// student can reply privately to the author: only the author and the Guru read replies, never
// other students (docs/DECISIONS.md #29). The student's own earlier replies are listed.
// Data: src/data/announcements.ts.

import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/components/app-text';
import { AttachmentList } from '@/components/attachment-list';
import { Button } from '@/components/button';
import { Notice } from '@/components/notice';
import { ReplyBox } from '@/components/reply-box';
import { ReplyCard } from '@/components/reply-card';
import { Screen } from '@/components/screen';
import { fetchAnnouncement, markRead, sendReply, type MyAnnouncement } from '@/data/announcements';
import { audienceName } from '@/i18n/labels';
import { formatDateTimeInIndia } from '@/lib/dates';

/** The announcement's title, message, details and the reply box. */
export default function MyAnnouncementScreen() {
  const { t } = useTranslation();
  const { id: idParam } = useLocalSearchParams<{ id: string }>();
  const id = Number(idParam);
  // undefined = loading, null = could not load, 'not_found' = not there or not addressed to me.
  const [loaded, setLoaded] = useState<MyAnnouncement | 'not_found' | null | undefined>(undefined);
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

  const { announcement: a, groupName, authorName, myReplies } = loaded;

  async function reply(body: string) {
    const outcome = await sendReply(a.id, body);
    if (!outcome.errorKey) await load();
    return outcome.errorKey;
  }

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
      <AttachmentList attachments={a.attachments} />
      <AppText tone="muted">
        {[
          formatDateTimeInIndia(a.publishAt),
          ...(authorName ? [t('announcements.postedBy', { name: authorName })] : []),
          audienceName(t, a, { groupName }),
        ].join(' · ')}
      </AppText>
      {a.editedAt ? (
        <AppText tone="muted">{t('announcements.edited', { date: formatDateTimeInIndia(a.editedAt) })}</AppText>
      ) : null}

      <ReplyBox
        title={authorName ? t('announcements.replies.replyTo', { name: authorName }) : t('announcements.replies.reply')}
        note={
          authorName
            ? t('announcements.replies.whoReads', { name: authorName })
            : t('announcements.replies.whoReadsNoName')
        }
        onSend={reply}
      />
      {myReplies.length > 0 ? (
        <>
          <AppText variant="label">{t('announcements.replies.mine', { number: myReplies.length })}</AppText>
          {myReplies.map((r) => (
            <ReplyCard
              key={r.id}
              body={r.body}
              when={t('announcements.replies.sentAt', { date: formatDateTimeInIndia(r.createdAt) })}
            />
          ))}
        </>
      ) : null}
    </Screen>
  );
}
