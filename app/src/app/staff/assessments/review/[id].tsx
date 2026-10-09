// C14 Review submission (Phase 2), for coordinators and the Guru: one student's assessment (the
// address holds the assignment id, so a push notification "Arjun sent a recording" opens it).
// Shows the student, the status, the due date, the recording (Play opens it in the browser view)
// or link and the student's note; then the review: a score for each rubric line, a comment, Accept
// or Ask for a redo, a voice note recorded in the app (slice 4, expo-audio), and for a level-up assessment "Send level-up to the Guru" (the Guru's
// decision, G7, comes in slice 2). Earlier recordings are listed with their reviews. While the
// student has not sent it yet, Remind sends them a push notification.
// Data: src/data/assessments.ts (review_submission, remind_assessment; migration 0016).

import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { AssignmentChips, MediaList, ScoreLines } from '@/components/assessment-parts';
import { AudioRecorderPanel, PlayButton } from '@/components/audio-recorder';
import { Button } from '@/components/button';
import { Checkbox } from '@/components/checkbox';
import { ChoiceGroup } from '@/components/choice-group';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { PersonHeader } from '@/components/person-header';
import { RouteIdGuard } from '@/components/route-id-guard';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { TextField } from '@/components/text-field';
import {
  checkReviewForm,
  COMMENT_MAX,
  fetchAssignment,
  OPEN_STATUSES,
  remindStudents,
  reviewSubmission,
  type AssignmentDetail,
  type ReviewForm,
  type ReviewFormErrors,
  type Submission,
} from '@/data/assessments';
import { recordingAsMedia } from '@/data/assessment-files';
import { fileSizeText, levelName } from '@/i18n/labels';
import { formatDateTime, formatDate } from '@/lib/dates';
import { spacing } from '@/theme/use-theme';

/** Longest voice note: 5 minutes. */
const VOICE_NOTE_SECONDS = 5 * 60;

/** One student's work and the review form. */
function ReviewScreenContent() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const { id: idParam } = useLocalSearchParams<{ id: string }>();
  const id = Number(idParam);
  const [loaded, setLoaded] = useState<AssignmentDetail | 'not_found' | null | undefined>(undefined);
  const [form, setForm] = useState<ReviewForm>({ scores: [], comment: '', outcome: null, sendLevelUp: false, voiceNote: null });
  const [errors, setErrors] = useState<ReviewFormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'info' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    const result = await fetchAssignment(id, true);
    setLoaded(result);
    if (result && result !== 'not_found') {
      setForm((current) =>
        current.scores.length === result.assessment.rubric.length
          ? current
          : { ...current, scores: result.assessment.rubric.map(() => null) },
      );
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const header = <Stack.Screen options={{ title: t('assessments.review.title') }} />;

  if (loaded === undefined || loaded === null || loaded === 'not_found') {
    return (
      <Screen underHeader centred>
        {header}
        {loaded === undefined ? <LoadingCards /> : null}
        {loaded === 'not_found' ? <Notice tone="error">{t('assessments.detail.notFound')}</Notice> : null}
        {loaded === null ? (
          <>
            <Notice tone="error" title={t('assessments.loadFailed')}>
              {t('common.networkError')}
            </Notice>
            <Button icon="refresh" label={t('common.tryAgain')} onPress={() => void load()} />
          </>
        ) : null}
      </Screen>
    );
  }

  const { assessment: a, release, submissions, student, status } = loaded;
  const latest = submissions[0];
  const toReview = status === 'submitted' && latest && !latest.reviewedAt ? latest : null;
  const earlier = toReview ? submissions.slice(1) : submissions;

  const update = (change: Partial<ReviewForm>) => {
    setForm((current) => ({ ...current, ...change }));
    setServerError(null);
  };

  async function save() {
    if (!toReview) return;
    const found = checkReviewForm(form, a.rubric);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setSaving(true);
    const errorKey = await reviewSubmission(toReview.id, profile?.id ?? '', { ...form, sendLevelUp: form.outcome === 'accepted' && form.sendLevelUp });
    setSaving(false);
    if (errorKey) {
      setServerError(t(errorKey));
      return;
    }
    setMessage({ tone: 'success', text: form.outcome === 'redo' ? t('assessments.review.redoDone') : t('assessments.review.acceptedDone') });
    setForm({ scores: a.rubric.map(() => null), comment: '', outcome: null, sendLevelUp: false, voiceNote: null });
    await load();
  }

  async function remind() {
    const { result, errorKey } = await remindStudents([id]);
    if (!result) {
      setMessage({ tone: 'error', text: t(errorKey ?? 'common.genericError') });
      return;
    }
    setMessage(
      result.reminded > 0
        ? { tone: 'success', text: t('assessments.remind.done', { count: 1 }) }
        : { tone: 'info', text: result.noLogin > 0 ? t('assessments.tracker.noLogin') : t('assessments.remind.skipped', { count: 1 }) },
    );
    await load();
  }

  return (
    <Screen underHeader onRefresh={load}>
      {header}
      {student ? (
        <PersonHeader name={student.fullName} details={[student.rollNo, levelName(t, student.levelId)]} />
      ) : null}
      <AssignmentChips status={status} dueOn={release.dueOn} />
      <AppText variant="subtitle">{a.title}</AppText>
      <AppText tone="muted">
        {[
          t('assessments.dueOn', { date: formatDate(release.dueOn) }),
          ...(loaded.seenAt ? [t('assessments.review.seenAt', { date: formatDateTime(loaded.seenAt) })] : []),
        ].join(' · ')}
      </AppText>

      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}

      {OPEN_STATUSES.includes(status) ? (
        <>
          <Notice tone="info">{status === 'redo' ? t('assessments.review.waitingRedo') : t('assessments.review.nothingYet')}</Notice>
          {student?.hasLogin ? (
            <Button variant="secondary" icon="send" label={t('assessments.remind.one')} onPress={() => void remind()} />
          ) : (
            <AppText tone="muted">{t('assessments.tracker.noLogin')}</AppText>
          )}
        </>
      ) : null}

      {toReview ? (
        <>
          <Section title={t('assessments.review.recording')} description={t('assessments.review.sentAt', { date: formatDateTime(toReview.submittedAt) })}>
            <SubmissionFiles submission={toReview} />
            {toReview.note ? <AppText>{t('assessments.review.studentNote', { note: toReview.note })}</AppText> : null}
          </Section>

          <Section title={t('assessments.review.scoreTitle')} description={t('assessments.review.scoreHint')}>
            {a.rubric.map((line, i) => (
              <ChoiceGroup
                key={`${line.criterion}-${i}`}
                chips
                label={t('assessments.review.lineLabel', { criterion: line.criterion, max: line.max })}
                choices={Array.from({ length: line.max + 1 }, (_, n) => ({ value: n, label: String(n) }))}
                value={form.scores[i] ?? null}
                onChange={(score) => update({ scores: form.scores.map((s, j) => (j === i ? score : s)) })}
              />
            ))}
            {errors.scores ? <Notice tone="error">{t(errors.scores)}</Notice> : null}
            <TextField
              label={t('assessments.review.comment')}
              hint={t('assessments.review.commentHint')}
              value={form.comment}
              onChangeText={(comment) => update({ comment })}
              maxLength={COMMENT_MAX}
              multiline
              style={styles.multiline}
              error={errors.comment ? t(errors.comment) : undefined}
            />
            <AppText variant="label">{t('recording.voiceNoteTitle')}</AppText>
            {form.voiceNote ? (
              <View style={styles.voice}>
                <AppText>{t('recording.voiceNoteReady', { size: fileSizeText(t, form.voiceNote.size) })}</AppText>
                <PlayButton uri={form.voiceNote.uri} />
                <Button variant="link" label={t('announcements.files.remove')} onPress={() => update({ voiceNote: null })} />
              </View>
            ) : (
              <AudioRecorderPanel
                mode="review"
                maxSeconds={VOICE_NOTE_SECONDS}
                useLabel={t('recording.useVoiceNote')}
                onTake={async (take) => {
                  const media = await recordingAsMedia(take, t('recording.voiceNoteName'));
                  if (typeof media === 'string') setServerError(t(media, { max: '50 MB' }));
                  else update({ voiceNote: media });
                }}
              />
            )}
            <ChoiceGroup
              label={t('assessments.review.outcome')}
              choices={[
                { value: 'accepted' as const, label: t('assessments.review.accept') },
                { value: 'redo' as const, label: t('assessments.review.redo') },
              ]}
              value={form.outcome}
              onChange={(outcome) => update({ outcome })}
              error={errors.outcome ? t(errors.outcome) : undefined}
            />
            {a.levelUp && form.outcome === 'accepted' ? (
              <Checkbox
                label={t('assessments.review.sendLevelUp')}
                checked={form.sendLevelUp}
                onChange={(sendLevelUp) => update({ sendLevelUp })}
              />
            ) : null}
          </Section>
          {serverError ? <Notice tone="error">{serverError}</Notice> : null}
          <Button label={t('assessments.review.save')} loading={saving} onPress={() => void save()} />
        </>
      ) : null}

      {earlier.length > 0 ? (
        <Section title={t(toReview ? 'assessments.review.history' : 'assessments.review.allRecordings', { count: earlier.length })}>
          {earlier.map((s) => (
            <View key={s.id} style={styles.history}>
              <AppText variant="label">{t('assessments.review.sentAt', { date: formatDateTime(s.submittedAt) })}</AppText>
              <SubmissionFiles submission={s} />
              {s.note ? <AppText tone="muted">{t('assessments.review.studentNote', { note: s.note })}</AppText> : null}
              {s.reviewedAt ? (
                <>
                  <AppText variant="label">
                    {[
                      s.outcome === 'redo' ? t('assessments.status.redo') : t('assessments.status.reviewed'),
                      ...(s.reviewedByName ? [t('assessments.review.by', { name: s.reviewedByName })] : []),
                      formatDateTime(s.reviewedAt),
                    ].join(' · ')}
                  </AppText>
                  <ScoreLines rubric={a.rubric} scores={s.scores} total={s.score} max={s.scoreMax} />
                  {s.comment ? <AppText>{s.comment}</AppText> : null}
                  {s.voiceNote && !s.fileRemovedAt ? (
                    <>
                      <AppText variant="label">{t('recording.voiceNoteFrom', { name: s.reviewedByName ?? t('assessments.detail.someone') })}</AppText>
                      <MediaList files={[s.voiceNote]} link={null} />
                    </>
                  ) : null}
                  {s.sendLevelUp ? <Notice tone="info">{t('assessments.review.sentToGuru')}</Notice> : null}
                </>
              ) : null}
            </View>
          ))}
        </Section>
      ) : null}
    </Screen>
  );
}

/** The file or link of one submission (the file may be gone after its keep time). */
function SubmissionFiles({ submission }: { submission: Submission }) {
  const { t } = useTranslation();
  const removed = submission.fileRemovedAt !== null;
  return (
    <MediaList
      files={submission.file && !removed ? [submission.file] : []}
      link={submission.link}
      removedNote={removed ? t('assessments.files.removed') : undefined}
    />
  );
}

const styles = StyleSheet.create({
  multiline: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  history: {
    gap: spacing.sm,
  },
  voice: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
});

/** Checks the address's id before the screen loads anything (D6-07). */
export default function ReviewScreen() {
  return (
    <RouteIdGuard kind="number">
      <ReviewScreenContent />
    </RouteIdGuard>
  );
}
