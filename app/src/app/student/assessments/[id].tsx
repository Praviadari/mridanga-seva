// S7 One assessment (Phase 2), for the student: what to do (the Guru's instructions and files,
// the coordinator's notes, the due date, how it is scored), and sending the recording: an audio
// or video file from the phone (recorded with the phone's own recorder or camera; at most 50 MB)
// or a recording made here in the app (slice 4, expo-audio), or a link (an unlisted YouTube video,
// Google Drive ...), with a note. After a review its mark comes first (#383): the newest reviewed recording's
// total, verdict, comment, voice note and score per rubric line, then the task, and for a redo the way to send it
// again. Recordings are named by number and day ("Recording 2 · 03-10-2026"); one made in the app reads as audio.
// Opened from S5 Record myself with ?take=<recording id>, that take is attached, ready to listen to and send.
// Opening it tells the coordinator it was seen. The address holds the assignment id, so a push
// notification opens it.
// Data: src/data/assessments.ts, files src/data/assessment-files.ts (migration 0016).

import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import type { TFunction } from 'i18next';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { AssignmentChips, MediaList, ScoreLines } from '@/components/assessment-parts';
import { AudioRecorderPanel, PlayButton } from '@/components/audio-recorder';
import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { RouteIdGuard } from '@/components/route-id-guard';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { Chip } from '@/components/status-chip';
import { TextField } from '@/components/text-field';
import {
  MAX_MEDIA_BYTES,
  pickGalleryVideo,
  pickRecordingFiles,
  recordingAsMedia,
  type MediaPickResult,
  type PickedMedia,
} from '@/data/assessment-files';
import {
  checkSubmitForm,
  fetchAssignment,
  markAssessmentSeen,
  NOTE_MAX,
  OPEN_STATUSES,
  rubricTotal,
  submitRecording,
  type AssignmentDetail,
  type RubricLine,
  type Submission,
  type SubmitFormErrors,
} from '@/data/assessments';
import { fileSizeText } from '@/i18n/labels';
import { newestReviewed, recordingNumber } from '@/lib/assessment-view';
import { formatDate, localDate } from '@/lib/dates';
import { listMyRecordings } from '@/lib/my-recordings';
import { takeOf } from '@/lib/recording';
import { radius, spacing, useTheme } from '@/theme/use-theme';

/** Longest recording made in the app for an assessment: 20 minutes (about 14 MB on a phone). */
const RECORD_SECONDS = 20 * 60;

/** The assessment, the student's recordings with their reviews, and the send form. */
function MyAssessmentScreenContent() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { profile } = useAuth();
  const myId = profile?.id ?? '';
  const { id: idParam, take: takeParam } = useLocalSearchParams<{ id: string; take?: string }>();
  const id = Number(idParam);
  const [loaded, setLoaded] = useState<AssignmentDetail | 'not_found' | null | undefined>(undefined);
  const [file, setFile] = useState<PickedMedia | null>(null);
  const [link, setLink] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<SubmitFormErrors>({});
  const [pickError, setPickError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sent, setSent] = useState(false);
  const [recorderOpen, setRecorderOpen] = useState(false);
  const [fromRecordMyself, setFromRecordMyself] = useState(false);
  // The Record-myself take named in the address is attached once.
  const takeUsed = useRef(false);
  // True once "seen" went out, so coming back does not send it again.
  const seenSent = useRef(false);

  const load = useCallback(async () => {
    const result = await fetchAssignment(id, false);
    setLoaded(result);
    if (result && result !== 'not_found' && !seenSent.current) {
      seenSent.current = await markAssessmentSeen(id);
      // The database moved Not seen to Seen; show it without loading again.
      if (seenSent.current && result.status === 'assigned') setLoaded({ ...result, status: 'seen' });
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    if (!takeParam || takeUsed.current) return;
    takeUsed.current = true;
    void (async () => {
      const kept = (await listMyRecordings()).find((r) => r.id === takeParam);
      if (!kept) {
        setPickError(t('recordMyself.takeGone'));
        return;
      }
      const media = await recordingAsMedia(await takeOf(kept.uri, kept.durationMs, kept.recordedAt), t('recording.fileName'));
      if (typeof media === 'string') setPickError(t(media, { max: fileSizeText(t, MAX_MEDIA_BYTES) }));
      else {
        setFile(media);
        setFromRecordMyself(true);
      }
    })();
  }, [takeParam, t]);

  const header = <Stack.Screen options={{ title: t('assessments.detail.title') }} />;

  if (loaded === undefined || loaded === null || loaded === 'not_found') {
    return (
      <Screen underHeader centred>
        {header}
        {loaded === undefined ? <LoadingCards /> : null}
        {loaded === 'not_found' ? (
          <>
            <Notice tone="error">{t('assessments.detail.notFound')}</Notice>
            <Button
              label={t('assessments.backToList')}
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/student/assessments'))}
            />
          </>
        ) : null}
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

  const { assessment: a, release, submissions, status } = loaded;
  const canSend = OPEN_STATUSES.includes(status);

  async function pick(picker: (room: number) => Promise<MediaPickResult>) {
    setPickError(null);
    const result = await picker(1);
    if (result.errorKey) setPickError(t(result.errorKey, { max: fileSizeText(t, MAX_MEDIA_BYTES) }));
    if (result.files[0]) setFile(result.files[0]);
  }

  async function send() {
    const found = checkSubmitForm(file, link, note);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setSaving(true);
    setServerError(null);
    const errorKey = await submitRecording(id, myId, file, link, note);
    setSaving(false);
    if (errorKey) {
      setServerError(t(errorKey));
      return;
    }
    setFile(null);
    setLink('');
    setNote('');
    setSent(true);
    await load();
  }

  // Recordings by number and day, the first one sent being 1: "Recording 2 · 03-10-2026" (#383).
  const recordingName = (index: number) =>
    t('assessments.submit.recordingName', {
      number: recordingNumber(index, submissions.length),
      date: formatDate(localDate(submissions[index].submittedAt)),
    });
  const marked = newestReviewed(submissions);

  return (
    <Screen underHeader onRefresh={load}>
      {header}
      <AssignmentChips status={status} dueOn={release.dueOn} />
      {sent ? <Notice tone="success">{t('assessments.submit.sent')}</Notice> : null}
      {status === 'submitted' && !sent ? <Notice tone="info">{t('assessments.submit.waiting')}</Notice> : null}

      {/* The mark first (#383): what the student opens the screen for once a review is in. */}
      {marked ? <MarkCard submission={marked} rubric={a.rubric} recordingName={recordingName(submissions.indexOf(marked))} /> : null}

      <Section title={a.title} description={t('assessments.dueOn', { date: formatDate(release.dueOn) })}>
        {a.instructions ? <AppText>{a.instructions}</AppText> : null}
        <MediaList files={a.media} link={a.mediaLink} />
        {release.notes ? (
          <AppText>
            {t('assessments.detail.coordinatorNote', { name: release.releasedByName ?? t('assessments.detail.someone'), note: release.notes })}
          </AppText>
        ) : null}
        <AppText variant="label">{t('assessments.detail.rubric', { max: rubricTotal(a.rubric) })}</AppText>
        {a.rubric.map((line, i) => (
          <AppText key={`${line.criterion}-${i}`} tone="muted">
            {t('assessments.detail.rubricLine', { criterion: line.criterion, max: line.max })}
          </AppText>
        ))}
      </Section>

      {canSend ? (
        <Section
          title={status === 'redo' ? t('assessments.submit.again') : t('assessments.submit.title')}
          description={t('assessments.submit.hint')}>
          {file ? (
            <View style={[styles.fileRow, { borderColor: colors.border }]}>
              <Icon name={file.kind === 'video' ? 'videoFile' : 'audio'} color={colors.primary} />
              <View style={styles.fileText}>
                <AppText variant="label">{file.name}</AppText>
                <AppText variant="small" tone="muted">
                  {fileSizeText(t, file.size)}
                </AppText>
              </View>
              {fromRecordMyself ? <PlayButton uri={file.uri} /> : null}
              <Button variant="link" label={t('announcements.files.remove')} onPress={() => setFile(null)} />
            </View>
          ) : (
            <View style={styles.actions}>
              {recorderOpen ? (
                <AudioRecorderPanel
                  mode="review"
                  maxSeconds={RECORD_SECONDS}
                  useLabel={t('recording.useForAssessment')}
                  onTake={async (take) => {
                    const media = await recordingAsMedia(take, t('recording.fileName'));
                    if (typeof media === 'string') setPickError(t(media, { max: fileSizeText(t, MAX_MEDIA_BYTES) }));
                    else {
                      setFile(media);
                      setRecorderOpen(false);
                    }
                  }}
                />
              ) : (
                <Button icon="record" label={t('recording.recordHere')} onPress={() => setRecorderOpen(true)} />
              )}
              <Button variant="secondary" icon="audio" label={t('assessments.files.chooseRecording')} onPress={() => void pick(pickRecordingFiles)} />
              <Button variant="secondary" icon="videoFile" label={t('assessments.files.addGalleryVideo')} onPress={() => void pick(() => pickGalleryVideo())} />
            </View>
          )}
          {fromRecordMyself && file ? <Notice tone="info">{t('recordMyself.attached')}</Notice> : null}
          {pickError ? <Notice tone="error">{pickError}</Notice> : null}
          <TextField
            label={t('assessments.submit.link')}
            hint={t('assessments.submit.linkHint')}
            value={link}
            onChangeText={setLink}
            autoCapitalize="none"
            keyboardType="url"
            error={errors.link ? t(errors.link) : undefined}
          />
          <TextField
            label={t('assessments.submit.note')}
            value={note}
            onChangeText={setNote}
            maxLength={NOTE_MAX}
            multiline
            style={styles.multiline}
            error={errors.note ? t(errors.note) : undefined}
          />
          {errors.recording ? <Notice tone="error">{t(errors.recording)}</Notice> : null}
          {serverError ? <Notice tone="error">{serverError}</Notice> : null}
          {saving && file ? <AppText tone="muted">{t('announcements.files.uploading')}</AppText> : null}
          <Button icon="send" label={t('assessments.submit.send')} loading={saving} onPress={() => void send()} />
        </Section>
      ) : null}

      {submissions.length > 0 ? (
        <Section title={t('assessments.submit.mine', { count: submissions.length })}>
          {submissions.map((s, i) => {
            const liveFile = s.file && !s.fileRemovedAt ? s.file : null;
            return (
              <View key={s.id} style={styles.history}>
                {/* The recording's own row carries its name; a link-only or deleted one gets it as a line. */}
                {liveFile ? null : <AppText variant="label">{recordingName(i)}</AppText>}
                <MediaList
                  files={liveFile ? [liveFile] : []}
                  link={s.link}
                  name={recordingName(i)}
                  removedNote={s.fileRemovedAt ? t('assessments.files.removed') : undefined}
                />
                {s === marked ? (
                  // Its mark is the card at the top; one line here.
                  <AppText tone="muted">{[scoreText(t, s), verdictText(t, s)].filter(Boolean).join(' · ')}</AppText>
                ) : s.reviewedAt ? (
                  <>
                    <AppText variant="label">
                      {[verdictText(t, s), ...(s.reviewedByName ? [t('assessments.review.by', { name: s.reviewedByName })] : [])].join(' · ')}
                    </AppText>
                    <ScoreLines rubric={a.rubric} scores={s.scores} total={s.score} max={s.scoreMax} />
                    {s.comment ? <AppText>{s.comment}</AppText> : null}
                    {s.voiceNote && !s.fileRemovedAt ? <VoiceNote submission={s} /> : null}
                  </>
                ) : (
                  <AppText tone="muted">{t('assessments.submit.notReviewed')}</AppText>
                )}
              </View>
            );
          })}
        </Section>
      ) : null}
    </Screen>
  );
}

/** A review's verdict: Accepted, or Please record it again. */
function verdictText(t: TFunction, s: Submission): string {
  return s.outcome === 'redo' ? t('assessments.submit.redoAsked') : t('assessments.submit.accepted');
}

/** A review's total as "8 of 15"; null when it has none. */
function scoreText(t: TFunction, s: Submission): string | null {
  return s.score !== null && s.scoreMax !== null ? t('assessments.scoreOf', { score: s.score, max: s.scoreMax }) : null;
}

/** The reviewer's voice note as one row: "Voice note from …", Audio, Play. */
function VoiceNote({ submission: s }: { submission: Submission }) {
  const { t } = useTranslation();
  if (!s.voiceNote) return null;
  return (
    <MediaList
      files={[s.voiceNote]}
      link={null}
      name={t('recording.voiceNoteFrom', { name: s.reviewedByName ?? t('assessments.detail.someone') })}
    />
  );
}

/**
 * The newest review, first on the screen (#383): the total large, the verdict and who reviewed, the comment, the
 * voice note, then the score of each rubric line. Google Classroom shows the mark first in the same way.
 */
function MarkCard({ submission: s, rubric, recordingName }: { submission: Submission; rubric: RubricLine[]; recordingName: string }) {
  const { t } = useTranslation();
  const redo = s.outcome === 'redo';
  const total = scoreText(t, s);
  return (
    <Section icon="score" title={t('assessments.submit.markTitle')} description={recordingName}>
      {total ? <AppText variant="number">{total}</AppText> : null}
      <View style={styles.verdict}>
        <Chip label={verdictText(t, s)} tone={redo ? 'danger' : 'success'} />
        {s.reviewedByName ? <AppText tone="muted">{t('assessments.review.by', { name: s.reviewedByName })}</AppText> : null}
      </View>
      {s.comment ? <AppText>{s.comment}</AppText> : null}
      {s.voiceNote && !s.fileRemovedAt ? <VoiceNote submission={s} /> : null}
      <ScoreLines rubric={rubric} scores={s.scores} total={null} max={null} />
    </Section>
  );
}

const styles = StyleSheet.create({
  verdict: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  multiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius,
    padding: spacing.sm,
    flexWrap: 'wrap',
  },
  fileText: {
    flex: 1,
    minWidth: 140,
    gap: spacing.xs,
  },
  actions: {
    gap: spacing.sm,
  },
  history: {
    gap: spacing.sm,
  },
});

/** Checks the address's id before the screen loads anything (D6-07). */
export default function MyAssessmentScreen() {
  return (
    <RouteIdGuard kind="number">
      <MyAssessmentScreenContent />
    </RouteIdGuard>
  );
}
