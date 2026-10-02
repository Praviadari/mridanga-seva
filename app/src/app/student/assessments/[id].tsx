// S7 One assessment (Phase 2), for the student: what to do (the Guru's instructions and files,
// the coordinator's notes, the due date, how it is scored), and sending the recording: an audio
// or video file from the phone (recorded with the phone's own recorder or camera; at most 50 MB)
// or a link (an unlisted YouTube video, Google Drive ...), with a note. After the review: the
// score per rubric line, the coordinator's comment, and for a redo the way to send it again.
// Opening it tells the coordinator it was seen. The address holds the assignment id, so a push
// notification opens it.
// Data: src/data/assessments.ts, files src/data/assessment-files.ts (migration 0012).

import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { AssignmentChips, MediaList, ScoreLines } from '@/components/assessment-parts';
import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { TextField } from '@/components/text-field';
import {
  MAX_MEDIA_BYTES,
  pickGalleryVideo,
  pickRecordingFiles,
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
  type SubmitFormErrors,
} from '@/data/assessments';
import { fileSizeText } from '@/i18n/labels';
import { formatDateTimeInIndia, formatDayMonthYear } from '@/lib/dates';
import { radius, spacing, useTheme } from '@/theme/use-theme';

/** The assessment, the student's recordings with their reviews, and the send form. */
export default function MyAssessmentScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { profile } = useAuth();
  const myId = profile?.id ?? '';
  const { id: idParam } = useLocalSearchParams<{ id: string }>();
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
  // True once "seen" went out, so coming back does not send it again.
  const seenSent = useRef(false);

  const load = useCallback(async () => {
    const result = await fetchAssignment(id, false);
    setLoaded(result);
    if (result && result !== 'not_found' && !seenSent.current) {
      seenSent.current = await markAssessmentSeen(id);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

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

  return (
    <Screen underHeader onRefresh={load}>
      {header}
      <AssignmentChips status={status} dueOn={release.dueOn} />
      <Section title={a.title} description={t('assessments.dueOn', { date: formatDayMonthYear(release.dueOn) })}>
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

      {sent ? <Notice tone="success">{t('assessments.submit.sent')}</Notice> : null}
      {status === 'submitted' && !sent ? <Notice tone="info">{t('assessments.submit.waiting')}</Notice> : null}

      {canSend ? (
        <Section
          title={status === 'redo' ? t('assessments.submit.again') : t('assessments.submit.title')}
          description={t('assessments.submit.hint')}>
          {file ? (
            <View style={[styles.fileRow, { borderColor: colors.border }]}>
              <Icon name={file.kind === 'video' ? 'video' : 'audio'} color={colors.primary} />
              <View style={styles.fileText}>
                <AppText variant="label">{file.name}</AppText>
                <AppText variant="small" tone="muted">
                  {fileSizeText(t, file.size)}
                </AppText>
              </View>
              <Button variant="link" label={t('announcements.files.remove')} onPress={() => setFile(null)} />
            </View>
          ) : (
            <View style={styles.actions}>
              <Button variant="secondary" icon="audio" label={t('assessments.files.chooseRecording')} onPress={() => void pick(pickRecordingFiles)} />
              <Button variant="secondary" icon="video" label={t('assessments.files.addGalleryVideo')} onPress={() => void pick(() => pickGalleryVideo())} />
            </View>
          )}
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
          {submissions.map((s) => (
            <View key={s.id} style={styles.history}>
              <AppText variant="label">{t('assessments.review.sentAt', { date: formatDateTimeInIndia(s.submittedAt) })}</AppText>
              <MediaList
                files={s.file && !s.fileRemovedAt ? [s.file] : []}
                link={s.link}
                removedNote={s.fileRemovedAt ? t('assessments.files.removed') : undefined}
              />
              {s.reviewedAt ? (
                <>
                  <AppText variant="label">
                    {[
                      s.outcome === 'redo' ? t('assessments.submit.redoAsked') : t('assessments.submit.accepted'),
                      ...(s.reviewedByName ? [t('assessments.review.by', { name: s.reviewedByName })] : []),
                    ].join(' · ')}
                  </AppText>
                  <ScoreLines rubric={a.rubric} scores={s.scores} total={s.score} max={s.scoreMax} />
                  {s.comment ? <AppText>{s.comment}</AppText> : null}
                </>
              ) : (
                <AppText tone="muted">{t('assessments.submit.notReviewed')}</AppText>
              )}
            </View>
          ))}
        </Section>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
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
