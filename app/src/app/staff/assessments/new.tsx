// G6 Create assessment (Phase 2), for the Guru: title, instructions, the type, the level, whether
// it is a level-up assessment, a rubric (what is scored, each line up to its top score), up to 3
// files (photos, PDFs, audio or video: a notation sheet, a demonstration) and a link (an unlisted
// YouTube video ...). "Send to coordinators" makes it visible to them at once; "Save as draft"
// keeps it for the Guru only. Coordinators who open this address see a note instead.
// Data: src/data/assessments.ts, files src/data/assessment-files.ts; the database checks it all
// again (migration 0012, docs/DECISIONS.md #43).

import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { assessmentKindName } from '@/components/assessment-parts';
import { Button } from '@/components/button';
import { Checkbox } from '@/components/checkbox';
import { ChoiceGroup } from '@/components/choice-group';
import { Icon } from '@/components/icon';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { TextField } from '@/components/text-field';
import {
  MAX_MEDIA,
  pickGalleryVideo,
  pickMediaPdfs,
  pickMediaPhotos,
  pickRecordingFiles,
  type MediaPickResult,
} from '@/data/assessment-files';
import {
  ASSESSMENT_KINDS,
  checkAssessmentForm,
  createAssessment,
  CRITERION_MAX,
  emptyAssessmentForm,
  INSTRUCTIONS_MAX,
  RUBRIC_MAX_LINES,
  TITLE_MAX,
  type AssessmentForm,
  type AssessmentFormErrors,
} from '@/data/assessments';
import { fileSizeText, levelName } from '@/i18n/labels';
import { spacing, useTheme } from '@/theme/use-theme';

/** The three levels (table levels in 0001). */
const LEVELS = [1, 2, 3] as const;

/** The G6 form and its two buttons. */
export default function NewAssessmentScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { area, profile } = useAuth();
  const myId = profile?.id ?? '';
  const [form, setForm] = useState<AssessmentForm>(() =>
    emptyAssessmentForm([t('assessments.rubricDefault1'), t('assessments.rubricDefault2'), t('assessments.rubricDefault3')]),
  );
  const [errors, setErrors] = useState<AssessmentFormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState<'send' | 'draft' | null>(null);
  const [picking, setPicking] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);

  const header = <Stack.Screen options={{ title: t('assessments.compose.title') }} />;
  if (area !== 'guru') {
    return (
      <Screen underHeader centred>
        {header}
        <Notice tone="info">{t('assessments.compose.guruOnly')}</Notice>
      </Screen>
    );
  }

  const update = (change: Partial<AssessmentForm>) => {
    setForm((current) => ({ ...current, ...change }));
    setServerError(null);
  };
  const room = MAX_MEDIA - form.files.length;

  async function add(picker: (room: number) => Promise<MediaPickResult>) {
    setPicking(true);
    setPickError(null);
    const result = await picker(room);
    setPicking(false);
    if (result.errorKey) setPickError(t(result.errorKey));
    if (result.files.length > 0) update({ files: [...form.files, ...result.files].slice(0, MAX_MEDIA) });
  }

  async function save(send: boolean) {
    const found = checkAssessmentForm(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setSaving(send ? 'send' : 'draft');
    const result = await createAssessment(form, myId, send);
    setSaving(null);
    if (result.errorKey || result.id === undefined) {
      setServerError(t(result.errorKey ?? 'common.genericError'));
      return;
    }
    router.replace({ pathname: '/staff/assessments/[id]', params: { id: String(result.id) } });
  }

  return (
    <Screen underHeader>
      {header}
      <Section title={t('assessments.compose.what')}>
        <TextField
          label={t('assessments.compose.titleLabel')}
          value={form.title}
          onChangeText={(title) => update({ title })}
          maxLength={TITLE_MAX}
          error={errors.title ? t(errors.title) : undefined}
        />
        <TextField
          label={t('assessments.compose.instructions')}
          hint={t('assessments.compose.instructionsHint')}
          value={form.instructions}
          onChangeText={(instructions) => update({ instructions })}
          maxLength={INSTRUCTIONS_MAX}
          multiline
          style={styles.multiline}
          error={errors.instructions ? t(errors.instructions) : undefined}
        />
        <ChoiceGroup
          label={t('assessments.compose.kind')}
          choices={ASSESSMENT_KINDS.map((kind) => ({ value: kind, label: assessmentKindName(t, kind) }))}
          value={form.kind}
          onChange={(kind) => update({ kind })}
        />
        <ChoiceGroup
          label={t('assessments.compose.level')}
          choices={LEVELS.map((id) => ({ value: id, label: levelName(t, id) }))}
          value={form.levelId}
          onChange={(levelId) => update({ levelId })}
          error={errors.level ? t(errors.level) : undefined}
        />
        <Checkbox
          label={t('assessments.compose.levelUpLabel')}
          checked={form.levelUp}
          onChange={(levelUp) => update({ levelUp })}
        />
      </Section>

      <Section title={t('assessments.compose.rubric')} description={t('assessments.compose.rubricHint')}>
        {form.rubric.map((line, index) => (
          <View key={line.key} style={styles.rubricRow}>
            <View style={styles.criterion}>
              <TextField
                label={t('assessments.compose.criterion', { number: index + 1 })}
                value={line.criterion}
                maxLength={CRITERION_MAX}
                onChangeText={(criterion) =>
                  update({ rubric: form.rubric.map((l) => (l.key === line.key ? { ...l, criterion } : l)) })
                }
              />
            </View>
            <View style={styles.top}>
              <TextField
                label={t('assessments.compose.topScore')}
                value={line.max}
                keyboardType="number-pad"
                maxLength={2}
                onChangeText={(max) => update({ rubric: form.rubric.map((l) => (l.key === line.key ? { ...l, max } : l)) })}
              />
            </View>
            <Button
              variant="link"
              label={t('assessments.compose.removeLine')}
              onPress={() => update({ rubric: form.rubric.filter((l) => l.key !== line.key) })}
            />
          </View>
        ))}
        {errors.rubric ? <Notice tone="error">{t(errors.rubric)}</Notice> : null}
        {form.rubric.length < RUBRIC_MAX_LINES ? (
          <Button
            variant="secondary"
            icon="add"
            label={t('assessments.compose.addLine')}
            onPress={() =>
              update({ rubric: [...form.rubric, { key: `line-${Date.now()}`, criterion: '', max: '5' }] })
            }
          />
        ) : null}
      </Section>

      <Section title={t('assessments.compose.files')} description={t('assessments.compose.filesHint', { max: MAX_MEDIA })}>
        {form.files.map((file) => (
          <View key={file.key} style={[styles.fileRow, { borderColor: colors.border }]}>
            <Icon name={file.kind === 'audio' ? 'audio' : file.kind === 'video' ? 'videoFile' : 'file'} color={colors.primary} />
            <View style={styles.fileText}>
              <AppText variant="label">{file.name}</AppText>
              <AppText variant="small" tone="muted">
                {`${t(`assessments.files.kind.${file.kind}`)} · ${fileSizeText(t, file.size)}`}
              </AppText>
            </View>
            <Button
              variant="link"
              label={t('announcements.files.remove')}
              onPress={() => update({ files: form.files.filter((f) => f.key !== file.key) })}
            />
          </View>
        ))}
        {pickError ? <Notice tone="error">{pickError}</Notice> : null}
        {room > 0 ? (
          <View style={styles.actions}>
            <Button variant="secondary" label={t('announcements.files.addPhotos')} disabled={picking} onPress={() => void add(pickMediaPhotos)} />
            <Button variant="secondary" label={t('announcements.files.addPdf')} disabled={picking} onPress={() => void add(pickMediaPdfs)} />
            <Button variant="secondary" icon="audio" label={t('assessments.files.addRecording')} disabled={picking} onPress={() => void add(pickRecordingFiles)} />
            <Button variant="secondary" icon="videoFile" label={t('assessments.files.addGalleryVideo')} disabled={picking} onPress={() => void add(() => pickGalleryVideo())} />
          </View>
        ) : (
          <AppText tone="muted">{t('announcements.files.full', { max: MAX_MEDIA })}</AppText>
        )}
        <TextField
          label={t('assessments.compose.link')}
          hint={t('assessments.compose.linkHint')}
          value={form.link}
          onChangeText={(link) => update({ link })}
          autoCapitalize="none"
          keyboardType="url"
          error={errors.link ? t(errors.link) : undefined}
        />
      </Section>

      {serverError ? <Notice tone="error">{serverError}</Notice> : null}
      {saving && form.files.length > 0 ? <AppText tone="muted">{t('announcements.files.uploading')}</AppText> : null}
      <Button
        icon="send"
        label={t('assessments.compose.send')}
        loading={saving === 'send'}
        disabled={saving !== null}
        onPress={() => void save(true)}
      />
      <Button
        variant="secondary"
        label={t('assessments.compose.saveDraft')}
        loading={saving === 'draft'}
        disabled={saving !== null}
        onPress={() => void save(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  multiline: {
    minHeight: 120,
    textAlignVertical: 'top',
  },
  rubricRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  criterion: {
    flexGrow: 1,
    flexBasis: 200,
  },
  top: {
    width: 110,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderTopWidth: 1,
    paddingTop: spacing.sm,
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
});
