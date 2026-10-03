// One taal for the Guru to add or edit (id 'new' adds one; Phase 2 slice 3, docs/DECISIONS.md #49):
// the name; the bols, one word per beat ('-' a rest, bols in one beat joined with a dot: te.re);
// the vibhags as beats per vibhag (4 4 4 4) with one mark each (X sam, 2-9 tali, 0 khali); the
// level (or every level); "placeholder"; whether students can play it; a note; the order. A
// preview of the beat grid shows it as the player will. Delete asks first; practice already logged
// keeps its minutes. Coordinators see the taal read-only. The database checks everything again
// (guard_taal, supabase/migrations/0016_practice.sql).

import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { BeatGrid } from '@/components/beat-grid';
import { Button } from '@/components/button';
import { Checkbox } from '@/components/checkbox';
import { ChoiceGroup } from '@/components/choice-group';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { TextField } from '@/components/text-field';
import { deleteTaal, fetchTaal, saveTaal, type Taal } from '@/data/practice';
import { levelName } from '@/i18n/labels';

const BEAT = /^(-|[^.\s-]{1,10}(\.[^.\s-]{1,10}){0,3})$/;

/** The form's fields read into a taal, or the first problem found (a translation key). */
function readForm(bolsText: string, divisionsText: string, marksText: string) {
  const bols = bolsText.trim().split(/\s+/).filter(Boolean).map((b) => b.toLowerCase());
  const divisions = divisionsText.trim().split(/[\s+,]+/).filter(Boolean).map(Number);
  const marks = marksText.trim().split(/[\s,]+/).filter(Boolean).map((m) => m.toUpperCase());
  let problem: 'beats' | 'bols' | 'divisions' | 'marks' | null = null;
  if (bols.length < 2 || bols.length > 32) problem = 'beats';
  else if (!bols.every((b) => BEAT.test(b))) problem = 'bols';
  else if (divisions.length === 0 || divisions.some((d) => !Number.isInteger(d) || d < 1) || divisions.reduce((a, b) => a + b, 0) !== bols.length) problem = 'divisions';
  else if (marks.length !== divisions.length || marks[0] !== 'X' || !marks.every((m) => /^(X|0|[1-9])$/.test(m))) problem = 'marks';
  return { bols, divisions, marks, problem };
}

/** Add or edit one taal. */
export default function TaalEditScreen() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const isGuru = profile?.role === 'guru';
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const taalId = isNew ? null : Number(id);

  const [loaded, setLoaded] = useState<Taal | null | undefined>(isNew ? null : undefined);
  const [name, setName] = useState('');
  const [bolsText, setBolsText] = useState('');
  const [divisionsText, setDivisionsText] = useState('');
  const [marksText, setMarksText] = useState('X');
  const [levelId, setLevelId] = useState<number>(0);
  const [placeholder, setPlaceholder] = useState(false);
  const [active, setActive] = useState(true);
  const [note, setNote] = useState('');
  const [sort, setSort] = useState('0');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (taalId === null) return;
    void fetchTaal(taalId).then((taal) => {
      setLoaded(taal);
      if (!taal) return;
      setName(taal.name);
      setBolsText(taal.bols.join(' '));
      setDivisionsText(taal.divisions.join(' '));
      setMarksText(taal.marks.join(' '));
      setLevelId(taal.levelId ?? 0);
      setPlaceholder(taal.placeholder);
      setActive(taal.active);
      setNote(taal.note ?? '');
      setSort(String(taal.sort));
    });
  }, [taalId]);

  const form = readForm(bolsText, divisionsText, marksText);
  const title = isNew ? t('taals.newTitle') : t('taals.editTitle');

  if (!isNew && loaded === undefined) {
    return (
      <Screen underHeader>
        <Stack.Screen options={{ title }} />
        <LoadingCards />
      </Screen>
    );
  }
  if (!isNew && loaded === null) {
    return (
      <Screen underHeader centred>
        <Stack.Screen options={{ title }} />
        <Notice tone="error" title={t('taals.notFound')}>
          {t('common.networkError')}
        </Notice>
      </Screen>
    );
  }

  const save = async () => {
    if (form.problem) {
      setError(t(`taals.problems.${form.problem}`));
      return;
    }
    setSaving(true);
    setError(null);
    const result = await saveTaal(taalId, {
      name,
      bols: form.bols,
      divisions: form.divisions,
      marks: form.marks,
      levelId: levelId === 0 ? null : levelId,
      placeholder,
      note,
      sort: Number.isInteger(Number(sort)) ? Number(sort) : 0,
      active,
    });
    setSaving(false);
    if ('errorKey' in result) {
      setError(t(result.errorKey));
      return;
    }
    router.dismissTo('/staff/taals');
  };

  const remove = async () => {
    if (!confirmDelete || taalId === null) {
      setConfirmDelete(true);
      return;
    }
    setSaving(true);
    const errorKey = await deleteTaal(taalId);
    setSaving(false);
    if (errorKey) {
      setError(t(errorKey));
      return;
    }
    router.dismissTo('/staff/taals');
  };

  return (
    <Screen underHeader>
      <Stack.Screen options={{ title }} />
      {!isGuru ? <Notice tone="info">{t('taals.introStaff')}</Notice> : null}
      <Section icon="taal" title={t('taals.fields')}>
        <TextField label={t('taals.name')} value={name} onChangeText={setName} maxLength={60} editable={isGuru} />
        <TextField
          label={t('taals.bols')}
          hint={t('taals.bolsHint')}
          value={bolsText}
          onChangeText={setBolsText}
          multiline
          autoCapitalize="none"
          editable={isGuru}
        />
        <TextField
          label={t('taals.divisions')}
          hint={t('taals.divisionsHint', { beats: form.bols.length })}
          value={divisionsText}
          onChangeText={setDivisionsText}
          editable={isGuru}
        />
        <TextField label={t('taals.marks')} hint={t('taals.marksHint')} value={marksText} onChangeText={setMarksText} autoCapitalize="characters" editable={isGuru} />
        <ChoiceGroup<number>
          chips
          label={t('taals.level')}
          value={levelId}
          onChange={(value) => isGuru && setLevelId(value)}
          choices={[{ value: 0, label: t('practice.allLevels') }, ...[1, 2, 3].map((l) => ({ value: l, label: levelName(t, l) }))]}
        />
        <Checkbox label={t('taals.placeholder')} checked={placeholder} onChange={(v) => isGuru && setPlaceholder(v)} />
        <Checkbox label={t('taals.active')} checked={active} onChange={(v) => isGuru && setActive(v)} />
        <TextField label={t('taals.note')} value={note} onChangeText={setNote} maxLength={300} multiline editable={isGuru} />
        <TextField label={t('taals.sort')} hint={t('taals.sortHint')} value={sort} onChangeText={setSort} keyboardType="number-pad" editable={isGuru} />
      </Section>

      <Section icon="syllabus" title={t('taals.preview')}>
        {form.problem ? (
          <AppText tone="muted">{t(`taals.problems.${form.problem}`)}</AppText>
        ) : (
          <BeatGrid bols={form.bols} divisions={form.divisions} marks={form.marks} current={null} />
        )}
      </Section>

      {error ? <Notice tone="error">{error}</Notice> : null}
      {isGuru ? <Button icon="check" label={t('taals.save')} loading={saving} onPress={() => void save()} /> : null}
      {isGuru && !isNew ? (
        <Button
          variant="secondary"
          icon="delete"
          label={confirmDelete ? t('taals.confirmDelete') : t('taals.delete')}
          disabled={saving}
          onPress={() => void remove()}
        />
      ) : null}
      {confirmDelete ? (
        <AppText variant="small" tone="muted">
          {t('taals.deleteHint')}
        </AppText>
      ) : null}
    </Screen>
  );
}
