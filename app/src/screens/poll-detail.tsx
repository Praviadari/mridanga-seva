// One poll (S12 for students, C17 for staff): the question, the answers to choose from (one), the
// closing time and who it is for. Voting saves at once and can be changed until the poll closes.
// Results (bars with counts) show when the person may see them: staff always; others after they
// voted or only after it closes, as the poll says. Staff also see who has voted — and what, only
// in a poll that is not anonymous — and have Remind, Edit, Close now and Delete (no votes yet).
// Routes: student/polls/[id].tsx, staff/polls/[id].tsx. Data: src/data/polls.ts (migration 0021).

import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-provider';
import { AnnouncementDetail } from '@/components/announcement-detail';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { ChoiceGroup } from '@/components/choice-group';
import { ListRow } from '@/components/list-row';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { ProgressBar } from '@/components/progress-bar';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import {
  canRemindPoll,
  closePoll,
  deletePoll,
  fetchPoll,
  fetchVoters,
  isClosed,
  remindPoll,
  votePoll,
  type PollItem,
  type PollVoter,
} from '@/data/polls';
import { audienceName } from '@/i18n/labels';
import { formatDateTimeInIndia } from '@/lib/dates';

type Loaded = { item: PollItem; groupName: string | null; authorName: string | null; voters: PollVoter[] | null };

/** The poll screen. */
export function PollDetailScreen({ id, area }: { id: number; area: 'student' | 'staff' }) {
  const { t } = useTranslation();
  const { profile, area: myArea } = useAuth();
  const myId = profile?.id ?? '';
  const isStaff = area === 'staff';
  const [loaded, setLoaded] = useState<Loaded | 'not_found' | null | undefined>(undefined);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [confirming, setConfirming] = useState<'close' | 'delete' | null>(null);
  const [showVoters, setShowVoters] = useState(false);

  const load = useCallback(async () => {
    const found = await fetchPoll(id);
    if (found === null || found === 'not_found') {
      setLoaded(found);
      return;
    }
    const voters = isStaff ? await fetchVoters(id) : null;
    setLoaded({ ...found, voters });
  }, [id, isStaff]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const header = <Stack.Screen options={{ title: t('polls.title') }} />;

  if (loaded === undefined || loaded === null || loaded === 'not_found') {
    return (
      <Screen underHeader centred>
        {header}
        {loaded === undefined ? <LoadingCards /> : null}
        {loaded === 'not_found' ? <Notice tone="info">{t('polls.notFound')}</Notice> : null}
        {loaded === null ? (
          <>
            <Notice tone="error" title={t('polls.loadFailed')}>
              {t('common.networkError')}
            </Notice>
            <Button icon="refresh" label={t('common.tryAgain')} onPress={() => void load()} />
          </>
        ) : null}
      </Screen>
    );
  }

  const { item, groupName, authorName, voters } = loaded;
  const { poll: p, state } = item;
  const closed = state.closed || isClosed(p);
  const canChange = isStaff && (p.createdBy === myId || myArea === 'guru');
  const notVoted = (voters ?? []).filter((v) => v.votedAt === null);
  const voted = (voters ?? []).filter((v) => v.votedAt !== null);
  const total = state.results ? state.results.reduce((a, b) => a + b, 0) : 0;

  async function vote(choice: number) {
    setBusy('vote');
    setMessage(null);
    const result = await votePoll(p.id, choice);
    setBusy(null);
    if (result.errorKey) setMessage({ tone: 'error', text: t(result.errorKey) });
    else await load();
  }

  async function remind() {
    setBusy('remind');
    setMessage(null);
    const result = await remindPoll(p.id);
    setBusy(null);
    if (result.errorKey) setMessage({ tone: 'error', text: t(result.errorKey) });
    else {
      setMessage({ tone: 'success', text: t('events.detail.reminded', { n: result.reminded ?? 0 }) });
      await load();
    }
  }

  async function confirm() {
    setBusy(confirming);
    setMessage(null);
    const result = confirming === 'delete' ? await deletePoll(p.id) : await closePoll(p.id);
    setBusy(null);
    if (result.errorKey) {
      setMessage({ tone: 'error', text: t(result.errorKey) });
      return;
    }
    if (confirming === 'delete') {
      router.back();
      return;
    }
    setConfirming(null);
    await load();
  }

  return (
    <Screen underHeader onRefresh={load}>
      {header}
      {closed ? <Notice tone="info">{t('polls.closedNotice')}</Notice> : null}
      <AnnouncementDetail
        title={p.question}
        body=""
        pinned={false}
        attachments={[]}
        facts={[
          {
            icon: 'time',
            text: closed
              ? t('polls.closedOn', { date: formatDateTimeInIndia(p.closedAt ?? p.closesAt) })
              : t('polls.closes', { date: formatDateTimeInIndia(p.closesAt) }),
          },
          { icon: 'groups', text: audienceName(t, p, { groupName, authorName, byMe: p.createdBy === myId }) },
          ...(authorName ? [{ icon: 'person' as const, text: t('events.detail.createdBy', { name: authorName }) }] : []),
          { icon: 'anonymous', text: p.anonymous ? t('polls.anonymousLine') : t('polls.namedLine') },
          { icon: 'poll', text: t(`polls.form.results.${p.resultsWhen}`) },
        ]}
      />

      {state.canVote && !closed ? (
        <Section icon="check" title={state.myChoice === null ? t('polls.yourVote') : t('polls.changeVote')}>
          <ChoiceGroup
            choices={p.options.map((o, i) => ({ value: i, label: o }))}
            value={state.myChoice}
            onChange={(i) => void vote(i)}
          />
          <AppText tone="muted">{state.myChoice === null ? t('polls.oneChoice') : t('polls.changeUntil')}</AppText>
          {busy === 'vote' ? <AppText tone="muted">{t('common.loading')}</AppText> : null}
        </Section>
      ) : null}
      {state.canVote && closed && state.myChoice !== null ? (
        <AppText>{t('polls.myVote', { answer: p.options[state.myChoice] ?? '' })}</AppText>
      ) : null}

      <Section icon="poll" title={t('polls.results')}>
        {state.results ? (
          <>
            {p.options.map((o, i) => (
              <ProgressBar
                key={o}
                done={state.results?.[i] ?? 0}
                total={Math.max(total, 1)}
                label={o}
                valueText={t('polls.votes', { n: state.results?.[i] ?? 0 })}
              />
            ))}
            <AppText tone="muted">{t('polls.votedCount', { voted: state.voted, addressed: state.addressed })}</AppText>
          </>
        ) : (
          <AppText tone="muted">
            {p.resultsWhen === 'after_close' ? t('polls.resultsAfterClose') : t('polls.resultsAfterVote')}
          </AppText>
        )}
      </Section>

      {isStaff ? (
        <Section icon="groups" title={t('polls.whoVoted')} description={p.anonymous ? t('polls.anonymousStaffNote') : undefined}>
          {voters === null ? <Notice tone="error">{t('events.detail.peopleFailed')}</Notice> : null}
          {notVoted.length > 0 ? (
            <>
              <AppText variant="label">{t('polls.notVotedList', { n: notVoted.length })}</AppText>
              {notVoted.map((v) => (
                <ListRow key={v.profileId} leading="initials" title={v.fullName} details={v.rollNo ? [v.rollNo] : []} />
              ))}
            </>
          ) : null}
          {voted.length > 0 ? (
            <Button
              variant="link"
              label={showVoters ? t('polls.hideVoted') : t('polls.showVoted', { n: voted.length })}
              onPress={() => setShowVoters(!showVoters)}
            />
          ) : null}
          {showVoters
            ? voted.map((v) => (
                <ListRow
                  key={v.profileId}
                  leading="initials"
                  title={v.fullName}
                  highlighted
                  details={[
                    ...(v.rollNo ? [v.rollNo] : []),
                    v.choice !== null ? t('polls.chose', { answer: p.options[v.choice] ?? '' }) : t('polls.votedAt', { date: formatDateTimeInIndia(v.votedAt ?? '') }),
                  ]}
                />
              ))
            : null}
        </Section>
      ) : null}

      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}

      {isStaff && !closed && !confirming ? (
        <>
          <Button
            variant="secondary"
            icon="bell"
            label={t('polls.remind')}
            disabled={!canRemindPoll(p) || notVoted.length === 0}
            loading={busy === 'remind'}
            onPress={() => void remind()}
          />
          {!canRemindPoll(p) ? <AppText tone="muted">{t('events.detail.remindLater')}</AppText> : null}
          {canChange ? (
            <>
              <Button
                variant="secondary"
                icon="edit"
                label={t('polls.edit')}
                onPress={() => router.push({ pathname: '/staff/polls/edit/[id]', params: { id: String(p.id) } })}
              />
              <Button variant="link" icon="cancel" label={t('polls.closeNow')} onPress={() => setConfirming('close')} />
              {state.voted === 0 ? (
                <Button variant="link" icon="delete" label={t('polls.delete')} onPress={() => setConfirming('delete')} />
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
      {confirming ? (
        <>
          <Notice tone="info" title={confirming === 'close' ? t('polls.closeTitle') : t('polls.deleteTitle')}>
            {confirming === 'close' ? t('polls.closeBody') : t('polls.deleteBody')}
          </Notice>
          <Button
            variant="secondary"
            label={confirming === 'close' ? t('polls.closeYes') : t('polls.deleteYes')}
            loading={busy === confirming}
            onPress={() => void confirm()}
          />
          <Button variant="link" label={t('events.detail.keep')} onPress={() => setConfirming(null)} />
        </>
      ) : null}
    </Screen>
  );
}
