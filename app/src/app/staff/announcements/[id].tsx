// C15 One announcement, for coordinators and the Guru: the whole message with its photos and
// PDFs, who it is for, when students see it, "Edited" when it was changed after publishing, and
// "seen by N of M" with the
// names of those who have not opened it yet (and on request those who have). The author and the
// Guru can edit it (./edit/[id].tsx), pin or unpin it and delete it; delete asks once more on the
// screen, because a pop-up does not work in the web version. The author and the Guru read the
// private replies; the Guru can delete one (moderation). Anyone else can reply to the author.
// Opening it counts as reading it. Opened from the list (./index.tsx) and after posting (./new.tsx).
// Data: src/data/announcements.ts; the counts come from the database (docs/DECISIONS.md #25, #29).

import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-provider';
import { AnnouncementDetail } from '@/components/announcement-detail';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { ListRow } from '@/components/list-row';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { ProgressBar } from '@/components/progress-bar';
import { ReplyBox } from '@/components/reply-box';
import { ReplyCard } from '@/components/reply-card';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import {
  deleteAnnouncement,
  deleteReply,
  fetchStaffAnnouncement,
  isScheduled,
  markRead,
  sendReply,
  setPinned,
  type Reply,
  type StaffAnnouncementDetail,
} from '@/data/announcements';
import { audienceName } from '@/i18n/labels';
import { withMyReceipt } from '@/lib/announcement-receipt';
import { formatDateTime } from '@/lib/dates';

/** The announcement, its seen list, and the author's actions. */
export default function StaffAnnouncementScreen() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const myId = profile?.id ?? '';
  const { id: idParam, posted } = useLocalSearchParams<{ id: string; posted?: string }>();
  const id = Number(idParam);
  // undefined = loading, null = could not load, 'not_found' = deleted or never there.
  const [loaded, setLoaded] = useState<StaffAnnouncementDetail | 'not_found' | null | undefined>(undefined);
  const [showSeen, setShowSeen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deleted, setDeleted] = useState(false);
  // The reply the Guru asked to delete, waiting for "Yes, delete".
  const [confirmingReply, setConfirmingReply] = useState<number | null>(null);
  const [replyError, setReplyError] = useState<string | null>(null);

  const load = useCallback(async () => {
    let result = await fetchStaffAnnouncement(id, myId);
    // Opening it counts as reading it, e.g. for a "staff only" announcement. On the first
    // opening, save the receipt and show it at once, so the reader is not listed as "not seen
    // yet" (no second load, audit D9-09).
    if (result && result !== 'not_found' && !result.announcement.readByMe && (await markRead(id))) {
      result = withMyReceipt(result, myId, new Date().toISOString());
    }
    setLoaded(result);
  }, [id, myId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const header = <Stack.Screen options={{ title: t('announcements.detail.title') }} />;
  const backToList = () =>
    router.canGoBack() ? router.back() : router.replace('/staff/announcements');

  if (deleted) {
    return (
      <Screen underHeader centred>
        {header}
        <Notice tone="success">{t('announcements.detail.deleted')}</Notice>
        <Button label={t('announcements.detail.back')} onPress={backToList} />
      </Screen>
    );
  }

  if (loaded === undefined || loaded === null || loaded === 'not_found') {
    return (
      <Screen underHeader centred>
        {header}
        {loaded === undefined ? <LoadingCards /> : null}
        {loaded === 'not_found' ? (
          <>
            <Notice tone="error">{t('announcements.detail.notFound')}</Notice>
            <Button label={t('announcements.detail.back')} onPress={backToList} />
          </>
        ) : null}
        {loaded === null ? (
          <>
            <Notice tone="error" title={t('announcements.loadFailed')}>
              {t('common.networkError')}
            </Notice>
            <Button icon="refresh" label={t('common.tryAgain')} onPress={() => void load()} />
          </>
        ) : null}
      </Screen>
    );
  }

  const { announcement: a, seenCount, audience, groupName, authorName, replies } = loaded;
  const byMe = a.createdBy === myId;
  const isGuru = profile?.role === 'guru';
  // The database decides in the end (row-level security); this only hides buttons that would fail.
  const canChange = byMe || isGuru;
  const scheduled = isScheduled(a);
  const when = formatDateTime(a.publishAt);
  const notSeen = audience.filter((m) => !m.readAt);
  const seen = audience.filter((m) => m.readAt);
  const personLine = (m: (typeof audience)[number]) => (m.rollNo ? [m.rollNo] : []);
  const writerOf = (r: Reply) => (r.rollNo ? `${r.fullName} · ${r.rollNo}` : r.fullName);

  async function reply(body: string) {
    const outcome = await sendReply(a.id, body);
    if (!outcome.errorKey) await load();
    return outcome.errorKey;
  }

  async function removeReply(replyId: number) {
    setBusy(true);
    setReplyError(null);
    const outcome = await deleteReply(replyId);
    setConfirmingReply(null);
    if (outcome.errorKey) setReplyError(t(outcome.errorKey));
    await load();
    setBusy(false);
  }

  /** The Guru's Delete under a reply, or "Yes, delete" and Cancel while asking. */
  const replyActions = (r: Reply) => {
    if (!isGuru) return [];
    if (confirmingReply !== r.id) {
      return [
        {
          label: t('announcements.replies.delete'),
          onPress: () => {
            setReplyError(null);
            setConfirmingReply(r.id);
          },
        },
      ];
    }
    return [
      { label: t('announcements.replies.deleteYes'), loading: busy, onPress: () => void removeReply(r.id) },
      { label: t('announcements.detail.cancel'), onPress: () => setConfirmingReply(null) },
    ];
  };

  async function togglePin() {
    setBusy(true);
    setActionError(null);
    const outcome = await setPinned(a.id, !a.pinned);
    if (outcome.errorKey) setActionError(t(outcome.errorKey));
    await load();
    setBusy(false);
  }

  async function remove() {
    setBusy(true);
    setActionError(null);
    const outcome = await deleteAnnouncement(a);
    setBusy(false);
    setConfirmingDelete(false);
    if (outcome.errorKey) setActionError(t(outcome.errorKey));
    else setDeleted(true);
  }

  return (
    <Screen underHeader onRefresh={load}>
      {header}
      {posted === '1' ? (
        <Notice tone="success">
          {scheduled ? t('announcements.detail.scheduled', { date: when }) : t('announcements.detail.posted')}
        </Notice>
      ) : null}

      <AnnouncementDetail
        title={a.title}
        body={a.body}
        pinned={a.pinned}
        attachments={a.attachments}
        facts={[
          { icon: 'time', text: scheduled ? t('announcements.scheduledFor', { date: when }) : when },
          ...(authorName ? [{ icon: 'person' as const, text: t('announcements.postedBy', { name: authorName }) }] : []),
          { icon: 'groups', text: audienceName(t, a, { groupName, authorName, byMe }) },
          ...(a.editedAt
            ? [{ icon: 'edit' as const, text: t('announcements.edited', { date: formatDateTime(a.editedAt) }) }]
            : []),
        ]}
      />

      <Section icon="check" title={t('announcements.detail.seenSection')}>
        {scheduled ? <AppText tone="muted">{t('announcements.detail.scheduledNote')}</AppText> : null}
        {seenCount.addressed > 0 ? (
          <ProgressBar
            done={seenCount.seen}
            total={seenCount.addressed}
            label={t('announcements.detail.seenLabel')}
            valueText={t('announcements.seenCount', { seen: seenCount.seen, addressed: seenCount.addressed })}
          />
        ) : (
          <AppText tone="muted">{t('announcements.detail.nobodyAddressed')}</AppText>
        )}
        {seenCount.noLogin > 0 ? (
          <AppText>{t('announcements.detail.noLoginNote', { number: seenCount.noLogin })}</AppText>
        ) : null}

        {seenCount.addressed > 0 && notSeen.length === 0 ? (
          <AppText tone="success">{t('announcements.detail.everyoneSeen')}</AppText>
        ) : null}
        {notSeen.length > 0 ? (
          <>
            <AppText variant="label">{t('announcements.detail.notSeenList', { number: notSeen.length })}</AppText>
            {notSeen.map((m) => (
              <ListRow key={m.profileId} title={m.fullName} details={personLine(m)} />
            ))}
          </>
        ) : null}

        {seen.length > 0 ? (
          <Button
            variant="link"
            label={showSeen ? t('announcements.detail.hideSeen') : t('announcements.detail.showSeen')}
            onPress={() => setShowSeen(!showSeen)}
          />
        ) : null}
        {showSeen && seen.length > 0 ? (
          <>
            <AppText variant="label">{t('announcements.detail.seenList', { number: seen.length })}</AppText>
            {seen.map((m) => (
              <ListRow
                key={m.profileId}
                title={m.fullName}
                highlighted
                details={[
                  ...personLine(m),
                  t('announcements.detail.seenAt', { date: formatDateTime(m.readAt ?? '') }),
                ]}
              />
            ))}
          </>
        ) : null}
      </Section>

      {/* The author and the Guru read every reply; anyone else only their own, under the box. */}
      {canChange ? (
        <Section
          icon="reply"
          title={t('announcements.replies.title', { number: replies.length })}
          description={t('announcements.replies.privateNote')}>
          {replies.length === 0 ? <AppText tone="muted">{t('announcements.replies.none')}</AppText> : null}
          {replies.map((r) => (
            <ReplyCard
              key={r.id}
              writer={writerOf(r)}
              body={r.body}
              when={formatDateTime(r.createdAt)}
              actions={replyActions(r)}
            />
          ))}
          {replyError ? <Notice tone="error">{replyError}</Notice> : null}
        </Section>
      ) : null}
      {!byMe ? (
        <ReplyBox
          title={
            authorName ? t('announcements.replies.replyTo', { name: authorName }) : t('announcements.replies.reply')
          }
          note={
            authorName
              ? t('announcements.replies.whoReads', { name: authorName })
              : t('announcements.replies.whoReadsNoName')
          }
          onSend={reply}
        />
      ) : null}
      {!canChange && replies.length > 0 ? (
        <>
          <AppText variant="label">{t('announcements.replies.mine', { number: replies.length })}</AppText>
          {replies.map((r) => (
            <ReplyCard
              key={r.id}
              body={r.body}
              when={t('announcements.replies.sentAt', { date: formatDateTime(r.createdAt) })}
            />
          ))}
        </>
      ) : null}

      {actionError ? <Notice tone="error">{actionError}</Notice> : null}
      {canChange && !confirmingDelete ? (
        <>
          <Button
            variant="secondary"
            icon="edit"
            label={t('announcements.detail.edit')}
            onPress={() =>
              router.push({ pathname: '/staff/announcements/edit/[id]', params: { id: String(a.id) } })
            }
          />
          <Button
            variant="secondary"
            label={a.pinned ? t('announcements.detail.unpin') : t('announcements.detail.pin')}
            loading={busy}
            onPress={() => void togglePin()}
          />
          <Button
            variant="link"
            icon="delete"
            label={t('announcements.detail.delete')}
            onPress={() => {
              setActionError(null);
              setConfirmingDelete(true);
            }}
          />
        </>
      ) : null}
      {confirmingDelete ? (
        <>
          <Notice tone="info" title={t('announcements.detail.deleteTitle', { title: a.title })}>
            {t('announcements.detail.deleteBody')}
          </Notice>
          <Button
            variant="secondary"
            label={t('announcements.detail.deleteYes')}
            loading={busy}
            onPress={() => void remove()}
          />
          <Button variant="link" label={t('announcements.detail.cancel')} onPress={() => setConfirmingDelete(false)} />
        </>
      ) : null}
    </Screen>
  );
}
