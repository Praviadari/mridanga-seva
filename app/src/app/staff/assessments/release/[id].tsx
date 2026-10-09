// C12 Release an assessment (Phase 2), for coordinators and the Guru: notes for the students, a
// due date (day-month-year, quick choices of 3, 7 or 14 days), and the students, picked from the
// list by level (the assessment's level first) and name, with "Select all shown". Students who
// already have it are left out; students without the app login can be picked but get no
// notification and see it only once they sign in. Releasing sends each student with the app a
// push notification (Android) and goes back to the assessment's tracker.
// Data: src/data/assessments.ts (release_assessment, migration 0016).

import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Checkbox } from '@/components/checkbox';
import { ChoiceGroup } from '@/components/choice-group';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { RouteIdGuard } from '@/components/route-id-guard';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { TextField } from '@/components/text-field';
import {
  checkReleaseForm,
  dueInDays,
  fetchReleaseOptions,
  NOTES_MAX,
  releaseAssessment,
  type ReleaseFormErrors,
  type ReleaseOptions,
} from '@/data/assessments';
import { levelName } from '@/i18n/labels';
import { searchFold } from '@/lib/search-text';
import { spacing } from '@/theme/use-theme';

/** Which level's students the list shows; 0 = all levels. */
type LevelFilter = 0 | 1 | 2 | 3;

/** The release form. */
function ReleaseAssessmentScreenContent() {
  const { t } = useTranslation();
  const { id: idParam } = useLocalSearchParams<{ id: string }>();
  const id = Number(idParam);
  const [options, setOptions] = useState<ReleaseOptions | 'not_found' | null | undefined>(undefined);
  const [notes, setNotes] = useState('');
  const [due, setDue] = useState(() => dueInDays(7));
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [level, setLevel] = useState<LevelFilter | null>(null);
  const [search, setSearch] = useState('');
  const [errors, setErrors] = useState<ReleaseFormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setOptions(await fetchReleaseOptions(id));
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const loaded = options && options !== 'not_found' ? options : null;
  // The assessment's own level until the coordinator picks another.
  const levelShown: LevelFilter = level ?? ((loaded?.assessment.levelId ?? 0) as LevelFilter);
  const candidates = useMemo(() => (loaded ? loaded.students.filter((s) => !s.alreadyHas) : []), [loaded]);
  const already = loaded ? loaded.students.length - candidates.length : 0;
  const shown = useMemo(() => {
    const words = searchFold(search);
    return candidates.filter(
      (s) =>
        (levelShown === 0 || s.levelId === levelShown) &&
        (!words || searchFold(s.fullName).includes(words) || s.rollNo.toLowerCase().includes(words)),
    );
  }, [candidates, levelShown, search]);

  const header = <Stack.Screen options={{ title: t('assessments.release.title') }} />;

  if (!loaded) {
    return (
      <Screen underHeader centred>
        {header}
        {options === undefined ? <LoadingCards /> : null}
        {options === 'not_found' ? <Notice tone="error">{t('assessments.detail.notFound')}</Notice> : null}
        {options === null ? (
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

  const toggle = (studentId: string, on: boolean) => {
    setPicked((current) => {
      const next = new Set(current);
      if (on) next.add(studentId);
      else next.delete(studentId);
      return next;
    });
    setServerError(null);
  };
  const allShownPicked = shown.length > 0 && shown.every((s) => picked.has(s.id));

  async function release() {
    const studentIds = [...picked];
    const found = checkReleaseForm(studentIds, due, notes);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setSaving(true);
    const { result, errorKey } = await releaseAssessment(id, studentIds, due, notes);
    setSaving(false);
    if (!result) {
      setServerError(t(errorKey ?? 'common.genericError'));
      return;
    }
    // Back to the assessment and its tracker; opened from a link, the form is replaced by it.
    router.dismissTo({ pathname: '/staff/assessments/[id]', params: { id: String(id) } });
  }

  return (
    <Screen underHeader>
      {header}
      <AppText variant="subtitle">{loaded.assessment.title}</AppText>
      <Section title={t('assessments.release.forStudents')}>
        <TextField
          label={t('assessments.release.notes')}
          hint={t('assessments.release.notesHint')}
          value={notes}
          onChangeText={setNotes}
          maxLength={NOTES_MAX}
          multiline
          style={styles.multiline}
          error={errors.notes ? t(errors.notes) : undefined}
        />
        <TextField
          label={t('assessments.release.due')}
          hint={t('assessments.release.dueHint')}
          value={due}
          onChangeText={setDue}
          keyboardType="numbers-and-punctuation"
          error={errors.due ? t(errors.due) : undefined}
        />
        <View style={styles.row}>
          {[3, 7, 14].map((days) => (
            <Button key={days} variant="secondary" label={t('assessments.release.inDays', { count: days })} onPress={() => setDue(dueInDays(days))} />
          ))}
        </View>
      </Section>

      <Section
        title={t('assessments.release.students', { count: picked.size })}
        description={already > 0 ? t('assessments.release.already', { count: already }) : undefined}>
        <ChoiceGroup
          chips
          choices={([0, 1, 2, 3] as const).map((value) => ({
            value,
            label: value === 0 ? t('assessments.release.allLevels') : levelName(t, value),
          }))}
          value={levelShown}
          onChange={setLevel}
        />
        <TextField label={t('assessments.release.search')} value={search} onChangeText={setSearch} autoCapitalize="none" />
        {shown.length > 0 ? (
          <Button
            variant="link"
            label={allShownPicked ? t('assessments.release.unselectShown') : t('assessments.release.selectShown', { count: shown.length })}
            onPress={() => shown.forEach((s) => toggle(s.id, !allShownPicked))}
          />
        ) : (
          <AppText tone="muted">{t('assessments.release.noneShown')}</AppText>
        )}
        {shown.map((s) => (
          <Checkbox
            key={s.id}
            label={[s.fullName, s.rollNo, levelName(t, s.levelId), ...(s.hasLogin ? [] : [t('assessments.tracker.noLogin')])].join(' · ')}
            checked={picked.has(s.id)}
            onChange={(on) => toggle(s.id, on)}
          />
        ))}
        {errors.students ? <Notice tone="error">{t(errors.students)}</Notice> : null}
      </Section>

      {serverError ? <Notice tone="error">{serverError}</Notice> : null}
      <Button
        icon="send"
        label={t('assessments.release.submit', { count: picked.size })}
        loading={saving}
        onPress={() => void release()}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  multiline: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});

/** Checks the address's id before the screen loads anything (D6-07). */
export default function ReleaseAssessmentScreen() {
  return (
    <RouteIdGuard kind="number">
      <ReleaseAssessmentScreenContent />
    </RouteIdGuard>
  );
}
