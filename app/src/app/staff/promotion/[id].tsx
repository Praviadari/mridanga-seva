// One promotion nomination (Phase 2, slice 2): the student, the reason, the criteria at the time of
// nomination, the level-up recording (play it beside the feedback), and the coordinators' answers.
// C23 for a coordinator: their answer, Ready / Almost / Not yet with a comment (they may change it
// while the nomination is open). G7 for the Guru: Promote (once enough coordinators answered), Not
// yet with guidance and a date after which the student may be nominated again, or More feedback.
// The nominator or the Guru may withdraw an open nomination. Data: src/data/promotion.ts
// (docs/DECISIONS.md #53).

import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { MediaList } from '@/components/assessment-parts';
import { Button } from '@/components/button';
import { ChoiceGroup } from '@/components/choice-group';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { CriteriaList, levelStep, nominationStatusName, RATING_TONE, ratingName } from '@/components/promotion-parts';
import { RouteIdGuard } from '@/components/route-id-guard';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { Chip } from '@/components/status-chip';
import { TextField } from '@/components/text-field';
import {
  checkDecision,
  COMMENT_MAX,
  dateInDays,
  decide,
  fetchNomination,
  giveFeedback,
  hasEnoughAnswers,
  NOTE_MAX,
  RATINGS,
  withdraw,
  type Decision,
  type DecisionErrors,
  type NominationDetail,
  type Rating,
} from '@/data/promotion';
import { levelName } from '@/i18n/labels';
import { formatDateTime, formatDate } from '@/lib/dates';
import { spacing } from '@/theme/use-theme';

/** Days ahead the Not yet date starts at. */
const NOT_YET_DAYS = 30;

/** The nomination, the answers, and the coordinator's or the Guru's form. */
function NominationScreenContent() {
  const { t } = useTranslation();
  const { area, profile } = useAuth();
  const isGuru = area === 'guru';
  const myId = profile?.id ?? '';
  const { id: idParam } = useLocalSearchParams<{ id: string }>();
  const id = Number(idParam);
  // undefined = loading, null = could not load.
  const [loaded, setLoaded] = useState<NominationDetail | 'not_found' | null | undefined>(undefined);
  const [message, setMessage] = useState<{ tone: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [busy, setBusy] = useState<'answer' | 'decide' | 'withdraw' | null>(null);
  // C23
  const [rating, setRating] = useState<Rating | null>(null);
  const [comment, setComment] = useState('');
  const [commentError, setCommentError] = useState<string | null>(null);
  // G7
  const [decision, setDecision] = useState<Decision | null>(null);
  const [note, setNote] = useState('');
  const [after, setAfter] = useState(() => dateInDays(NOT_YET_DAYS));
  const [decisionErrors, setDecisionErrors] = useState<DecisionErrors>({});
  const [confirm, setConfirm] = useState<'promote' | 'withdraw' | null>(null);

  const load = useCallback(async () => {
    const result = await fetchNomination(id);
    setLoaded(result);
    // My answer so far fills the form, once.
    if (result && result !== 'not_found') {
      const mine = result.answers.find((a) => a.coordinatorId === myId);
      if (mine) {
        setRating((current) => current ?? mine.rating);
        setComment((current) => current || mine.comment);
      }
    }
  }, [id, myId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const header = <Stack.Screen options={{ title: t('promotion.detail.title') }} />;

  if (!loaded || loaded === 'not_found') {
    return (
      <Screen underHeader centred>
        {header}
        {loaded === undefined ? <LoadingCards /> : null}
        {loaded === 'not_found' ? <Notice tone="error">{t('promotion.errors.nomination_not_found')}</Notice> : null}
        {loaded === null ? (
          <>
            <Notice tone="error" title={t('promotion.loadFailed')}>
              {t('common.networkError')}
            </Notice>
            <Button icon="refresh" label={t('common.tryAgain')} onPress={() => void load()} />
          </>
        ) : null}
      </Screen>
    );
  }

  const { item, answers, recording, askedNames } = loaded;
  const isOpen = item.status === 'open';
  const enough = hasEnoughAnswers(item);
  const mine = answers.find((a) => a.coordinatorId === myId);
  const canWithdraw = isOpen && (isGuru || item.nominatedBy === myId);

  async function saveAnswer() {
    if (!rating) {
      setCommentError(t('promotion.errors.rating_invalid'));
      return;
    }
    if (!comment.trim()) {
      setCommentError(t('promotion.errors.comment_required'));
      return;
    }
    setBusy('answer');
    const errorKey = await giveFeedback(item.id, rating, comment);
    setBusy(null);
    setMessage(errorKey ? { tone: 'error', text: t(errorKey) } : { tone: 'success', text: t('promotion.answer.saved') });
    if (!errorKey) await load();
  }

  async function sendDecision() {
    if (!decision) return;
    const found = checkDecision(decision, note, after);
    setDecisionErrors(found);
    if (Object.keys(found).length > 0) return;
    if (decision === 'promote' && confirm !== 'promote') {
      setConfirm('promote');
      return;
    }
    setBusy('decide');
    const errorKey = await decide(item.id, decision, note, after);
    setBusy(null);
    setConfirm(null);
    if (errorKey) {
      setMessage({ tone: 'error', text: t(errorKey) });
      return;
    }
    setMessage({ tone: 'success', text: t(`promotion.decide.done.${decision}`) });
    setDecision(null);
    setNote('');
    await load();
  }

  async function takeBack() {
    if (confirm !== 'withdraw') {
      setConfirm('withdraw');
      return;
    }
    setBusy('withdraw');
    const errorKey = await withdraw(item.id);
    setBusy(null);
    setConfirm(null);
    setMessage(errorKey ? { tone: 'error', text: t(errorKey) } : { tone: 'info', text: t('promotion.withdraw.done') });
    if (!errorKey) await load();
  }

  return (
    <Screen underHeader wide onRefresh={load}>
      {header}
      <Section icon="promote" title={item.fullName} description={`${item.rollNo} · ${levelStep(t, item.fromLevel, item.toLevel)}`}>
        <View style={styles.chips}>
          <Chip
            label={nominationStatusName(t, item.status)}
            tone={item.status === 'promoted' ? 'success' : item.status === 'open' ? 'info' : 'neutral'}
          />
          <Chip label={t('promotion.answersShort', { count: item.answers, needed: item.answersNeeded })} tone={enough ? 'success' : 'warning'} />
        </View>
        <AppText variant="label">{t('promotion.detail.reason')}</AppText>
        <AppText>{item.reason}</AppText>
        <AppText variant="small" tone="muted">
          {t('promotion.nominatedLine', {
            date: formatDateTime(item.nominatedAt),
            name: item.nominatedByName ?? t('promotion.someone'),
          })}
        </AppText>
        {askedNames.length > 0 ? (
          <AppText variant="small" tone="muted">
            {t('promotion.detail.asked', { names: askedNames.join(', ') })}
          </AppText>
        ) : null}
        <Button
          variant="link"
          icon="person"
          label={t('promotion.detail.openStudent')}
          onPress={() => router.push({ pathname: '/staff/students/[id]', params: { id: item.studentId } })}
        />
      </Section>

      {item.status === 'promoted' ? (
        <Notice tone="success" title={t('promotion.detail.promotedTitle', { level: levelName(t, item.toLevel) })}>
          {[
            t('promotion.detail.decidedBy', {
              name: item.decidedByName ?? t('promotion.someone'),
              date: item.decidedAt ? formatDateTime(item.decidedAt) : '',
            }),
            ...(item.guidance ? [item.guidance] : []),
          ].join('\n')}
        </Notice>
      ) : null}
      {item.status === 'not_yet' ? (
        <Notice tone="info" title={t('promotion.detail.notYetTitle')}>
          {[
            item.guidance ?? '',
            item.renominateAfter ? t('promotion.panel.notYetUntil', { date: formatDate(item.renominateAfter) }) : '',
            t('promotion.detail.decidedBy', {
              name: item.decidedByName ?? t('promotion.someone'),
              date: item.decidedAt ? formatDateTime(item.decidedAt) : '',
            }),
          ].filter(Boolean).join('\n')}
        </Notice>
      ) : null}
      {item.status === 'withdrawn' ? <Notice tone="info">{t('promotion.detail.withdrawn')}</Notice> : null}
      {isOpen && item.moreAskedAt ? (
        <Notice tone="info" title={t('promotion.detail.moreAsked', { date: formatDateTime(item.moreAskedAt) })}>
          {item.moreNote ?? ''}
        </Notice>
      ) : null}

      {item.criteria ? (
        <Section icon="check" title={t('promotion.detail.criteria')} description={t('promotion.detail.criteriaHint')}>
          <CriteriaList criteria={item.criteria} />
        </Section>
      ) : null}

      {recording ? (
        <Section
          icon="assessment"
          title={t('promotion.detail.recording')}
          description={item.criteria?.levelUp?.title ?? undefined}>
          <MediaList
            files={recording.file && !recording.fileRemovedAt ? [recording.file] : []}
            link={recording.link}
            removedNote={recording.fileRemovedAt ? t('assessments.files.removed') : undefined}
          />
          {recording.score !== null && recording.scoreMax !== null ? (
            <AppText variant="label">{t('assessments.scoreOf', { score: recording.score, max: recording.scoreMax })}</AppText>
          ) : null}
          {recording.comment ? (
            <AppText tone="muted">
              {recording.reviewedByName ? `${recording.reviewedByName}: ${recording.comment}` : recording.comment}
            </AppText>
          ) : null}
          <Button
            variant="link"
            label={t('promotion.detail.openReview')}
            onPress={() =>
              router.push({ pathname: '/staff/assessments/review/[id]', params: { id: String(recording.assignmentId) } })
            }
          />
        </Section>
      ) : null}

      <Section
        icon="feedback"
        title={t('promotion.detail.answers', { count: answers.length, needed: item.answersNeeded })}
        description={t('promotion.detail.answersHint')}>
        {answers.length === 0 ? <AppText tone="muted">{t('promotion.detail.noAnswers')}</AppText> : null}
        {answers.map((a) => (
          <View key={a.coordinatorId} style={styles.answer}>
            <View style={styles.answerHead}>
              <AppText variant="label">{a.name ?? t('promotion.someone')}</AppText>
              <Chip label={ratingName(t, a.rating)} tone={RATING_TONE[a.rating]} />
            </View>
            <AppText>{a.comment}</AppText>
            <AppText variant="small" tone="muted">
              {formatDateTime(a.updatedAt)}
            </AppText>
          </View>
        ))}
      </Section>

      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}

      {isOpen && !isGuru ? (
        <Section title={t(mine ? 'promotion.answer.change' : 'promotion.answer.title')} description={t('promotion.answer.hint')}>
          <ChoiceGroup
            label={t('promotion.answer.rating')}
            choices={RATINGS.map((r) => ({ value: r, label: ratingName(t, r) }))}
            value={rating}
            onChange={(value) => {
              setRating(value);
              setCommentError(null);
            }}
          />
          <TextField
            label={t('promotion.answer.comment')}
            hint={t('promotion.answer.commentHint')}
            value={comment}
            onChangeText={(text) => {
              setComment(text);
              setCommentError(null);
            }}
            maxLength={COMMENT_MAX}
            multiline
            style={styles.multiline}
            error={commentError ?? undefined}
          />
          <Button icon="send" label={t('promotion.answer.save')} loading={busy === 'answer'} onPress={() => void saveAnswer()} />
        </Section>
      ) : null}

      {isOpen && isGuru ? (
        <Section title={t('promotion.decide.title')} description={t('promotion.decide.hint')}>
          {!enough ? (
            <Notice tone="info">{t('promotion.decide.needsAnswers', { count: item.answersNeeded - item.answers })}</Notice>
          ) : null}
          <ChoiceGroup
            label={t('promotion.decide.choose')}
            choices={[
              ...(enough ? [{ value: 'promote' as const, label: t('promotion.decide.promote', { level: levelName(t, item.toLevel) }) }] : []),
              { value: 'not_yet' as const, label: t('promotion.decide.notYet') },
              { value: 'more' as const, label: t('promotion.decide.more') },
            ]}
            value={decision}
            onChange={(value) => {
              setDecision(value);
              setDecisionErrors({});
              setConfirm(null);
            }}
          />
          {decision ? (
            <TextField
              label={t(`promotion.decide.noteLabel.${decision}`)}
              hint={t(`promotion.decide.noteHint.${decision}`)}
              value={note}
              onChangeText={(text) => {
                setNote(text);
                setDecisionErrors({});
              }}
              maxLength={NOTE_MAX}
              multiline
              style={styles.multiline}
              error={decisionErrors.note ? t(decisionErrors.note) : undefined}
            />
          ) : null}
          {decision === 'not_yet' ? (
            <TextField
              label={t('promotion.decide.after')}
              hint={t('promotion.decide.afterHint')}
              value={after}
              onChangeText={(text) => {
                setAfter(text);
                setDecisionErrors({});
              }}
              keyboardType="numbers-and-punctuation"
              error={decisionErrors.date ? t(decisionErrors.date) : undefined}
            />
          ) : null}
          {confirm === 'promote' ? (
            <Notice tone="info" title={t('promotion.decide.confirmTitle', { name: item.fullName, level: levelName(t, item.toLevel) })}>
              {t('promotion.decide.confirmBody')}
            </Notice>
          ) : null}
          {decision ? (
            <View style={styles.row}>
              <Button
                icon={decision === 'promote' ? 'promote' : 'send'}
                label={
                  confirm === 'promote'
                    ? t('promotion.decide.confirmYes')
                    : t(`promotion.decide.send.${decision}`, { level: levelName(t, item.toLevel) })
                }
                loading={busy === 'decide'}
                onPress={() => void sendDecision()}
              />
              {confirm === 'promote' ? (
                <Button variant="link" label={t('promotion.decide.confirmNo')} onPress={() => setConfirm(null)} />
              ) : null}
            </View>
          ) : null}
        </Section>
      ) : null}

      {canWithdraw ? (
        <>
          {confirm === 'withdraw' ? (
            <Notice tone="info" title={t('promotion.withdraw.ask')}>
              {t('promotion.withdraw.note')}
            </Notice>
          ) : null}
          <View style={styles.row}>
            <Button
              variant={confirm === 'withdraw' ? 'secondary' : 'link'}
              icon="delete"
              label={confirm === 'withdraw' ? t('promotion.withdraw.yes') : t('promotion.withdraw.button')}
              loading={busy === 'withdraw'}
              onPress={() => void takeBack()}
            />
            {confirm === 'withdraw' ? (
              <Button variant="link" label={t('promotion.withdraw.no')} onPress={() => setConfirm(null)} />
            ) : null}
          </View>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  answer: {
    gap: spacing.xs,
  },
  answerHead: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  multiline: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});

/** Checks the address's id before the screen loads anything (D6-07). */
export default function NominationScreen() {
  return (
    <RouteIdGuard kind="number">
      <NominationScreenContent />
    </RouteIdGuard>
  );
}
