// Practice of the week (docs/DECISIONS.md #400-#401), for the Guru and coordinators (the teachers, #11): per level,
// the weekly goal (days a week, minutes a day; 5 x 15 until changed), up to three things to practise (a taal at a
// tempo, or one of the level's lesson videos) and a note. Students of that level see it at the top of Practice tools,
// with Start / Watch, and their week against the goal. Opened from Practice tools. Edits to each level are kept while
// another level is looked at; Save saves the level shown. Data: data/practice.ts, table practice_plans
// (supabase/migrations/0052_practice_more.sql, which checks everything again).

import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { ChoiceGroup } from '@/components/choice-group';
import { LoadingCards } from '@/components/loading-cards';
import { ScreenIntro } from '@/components/more-text';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { SelectField } from '@/components/select-field';
import { TextField } from '@/components/text-field';
import { fetchMaterials, lessonSourceOf, type Material } from '@/data/materials';
import {
  fetchAllTaals,
  fetchPracticePlans,
  MAX_PLAN_ITEMS,
  PLAN_NOTE_MAX,
  savePracticePlan,
  type PlanItem,
  type PracticePlan,
  type Taal,
} from '@/data/practice';
import { LEVEL_IDS, levelName } from '@/i18n/labels';
import { formatDate, localDate } from '@/lib/dates';
import { MAX_BPM, MIN_BPM } from '@/lib/practice-pattern';
import { cardLook, spacing, useTheme } from '@/theme/use-theme';

/** One item as the form holds it: the tempo as typed. */
type FormItem = { kind: 'taal'; taalId: number; bpmText: string } | { kind: 'lesson'; materialId: number };

/** One level's plan as the form holds it. */
type Form = { goalDays: number; goalMinutes: number; note: string; items: FormItem[]; updatedAt: string | null };

const MINUTE_CHOICES = [5, 10, 15, 20, 30, 45, 60];

function formOf(plan: PracticePlan): Form {
  return {
    goalDays: plan.goal.days,
    goalMinutes: plan.goal.minutes,
    note: plan.note ?? '',
    items: plan.items.map((i) => (i.kind === 'taal' ? { kind: 'taal', taalId: i.taalId, bpmText: String(i.bpm) } : i)),
    updatedAt: plan.updatedAt,
  };
}

/** The form read into a plan, or null when a taal's tempo is not 30-240. */
function planOf(levelId: number, form: Form): PracticePlan | null {
  const items: PlanItem[] = [];
  for (const item of form.items) {
    if (item.kind === 'lesson') {
      items.push(item);
      continue;
    }
    const bpm = Number(item.bpmText.trim());
    if (!Number.isInteger(bpm) || bpm < MIN_BPM || bpm > MAX_BPM) return null;
    items.push({ kind: 'taal', taalId: item.taalId, bpm });
  }
  return { levelId, goal: { days: form.goalDays, minutes: form.goalMinutes }, note: form.note, items, updatedAt: form.updatedAt };
}

/** The practice of the week, per level. */
export default function PracticePlanScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [levelId, setLevelId] = useState<number>(LEVEL_IDS[0]);
  const [forms, setForms] = useState<Map<number, Form> | null | undefined>(undefined);
  const [taals, setTaals] = useState<Taal[]>([]);
  const [lessons, setLessons] = useState<Map<number, Material[]>>(new Map());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    const [plans, allTaals, byLevel] = await Promise.all([
      fetchPracticePlans(LEVEL_IDS),
      fetchAllTaals(),
      Promise.all(LEVEL_IDS.map((id) => fetchMaterials(id))),
    ]);
    setTaals((allTaals ?? []).filter((tl) => tl.active));
    // A level's students may open its own and lower levels' lessons; the list offers the level's and every level's.
    setLessons(new Map(LEVEL_IDS.map((id, i) => [id, (byLevel[i] ?? []).filter((m) => m.approved && lessonSourceOf(m) !== null)])));
    // Edits not saved yet stay when the screen comes back into view.
    setForms((current) => current ?? (plans ? new Map([...plans].map(([id, plan]) => [id, formOf(plan)])) : null));
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const header = <Stack.Screen options={{ title: t('practicePlan.title') }} />;

  if (!forms) {
    return (
      <Screen underHeader centred={forms === null}>
        {header}
        {forms === undefined ? <LoadingCards /> : null}
        {forms === null ? (
          <>
            <Notice tone="error" title={t('practicePlan.loadFailed')}>
              {t('common.networkError')}
            </Notice>
            <Button icon="refresh" label={t('common.tryAgain')} onPress={() => void load()} />
          </>
        ) : null}
      </Screen>
    );
  }

  const form = forms.get(levelId) as Form;
  const levelLessons = lessons.get(levelId) ?? [];
  const change = (patch: Partial<Form>) => {
    setMessage(null);
    setForms(new Map(forms).set(levelId, { ...form, ...patch }));
  };
  const changeItem = (index: number, item: FormItem | null) =>
    change({ items: item ? form.items.map((x, i) => (i === index ? item : x)) : form.items.filter((_, i) => i !== index) });

  const save = async () => {
    const plan = planOf(levelId, form);
    if (!plan) {
      setMessage({ tone: 'error', text: t('practicePlan.errors.plan_bpm_invalid') });
      return;
    }
    setSaving(true);
    const errorKey = await savePracticePlan(plan);
    setSaving(false);
    if (errorKey) {
      setMessage({ tone: 'error', text: t(errorKey) });
      return;
    }
    setMessage({ tone: 'success', text: t('practicePlan.saved', { level: levelName(t, levelId) }) });
    setForms(new Map(forms).set(levelId, { ...form, updatedAt: new Date().toISOString() }));
  };

  return (
    <Screen underHeader onRefresh={load}>
      {header}
      <ScreenIntro text={t('practicePlan.intro')} />
      <ChoiceGroup<number>
        segmented
        label={t('practicePlan.level')}
        value={levelId}
        onChange={(id) => {
          setLevelId(id);
          setMessage(null);
        }}
        choices={LEVEL_IDS.map((id) => ({ value: id, label: levelName(t, id) }))}
      />

      <Section icon="promote" title={t('practicePlan.goalTitle')} description={t('practicePlan.goalIntro')}>
        <ChoiceGroup<number>
          segmented
          label={t('practicePlan.goalDays')}
          value={form.goalDays}
          onChange={(goalDays) => change({ goalDays })}
          choices={[1, 2, 3, 4, 5, 6, 7].map((n) => ({ value: n, label: String(n) }))}
        />
        <ChoiceGroup<number>
          chips
          label={t('practicePlan.goalMinutes')}
          value={form.goalMinutes}
          onChange={(goalMinutes) => change({ goalMinutes })}
          choices={[...new Set([...MINUTE_CHOICES, form.goalMinutes])].sort((a, b) => a - b).map((n) => ({ value: n, label: t('practice.minutes', { m: n }) }))}
        />
      </Section>

      <Section icon="todo" title={t('practicePlan.itemsTitle')} description={t('practicePlan.itemsIntro', { count: MAX_PLAN_ITEMS })}>
        {form.items.length === 0 ? <AppText tone="muted">{t('practicePlan.empty')}</AppText> : null}
        {form.items.map((item, index) => (
          <View key={index} style={[styles.item, cardLook(colors)]}>
            {item.kind === 'taal' ? (
              <>
                <SelectField<number>
                  label={t('practicePlan.taal')}
                  value={item.taalId}
                  onChange={(taalId) => changeItem(index, { ...item, taalId })}
                  options={taals.map((tl) => ({ value: tl.id, label: tl.name }))}
                />
                <TextField
                  label={t('practicePlan.bpm')}
                  hint={t('practicePlan.bpmHint', { min: MIN_BPM, max: MAX_BPM })}
                  value={item.bpmText}
                  onChangeText={(bpmText) => changeItem(index, { ...item, bpmText })}
                  keyboardType="number-pad"
                  maxLength={3}
                />
              </>
            ) : (
              <SelectField<number>
                label={t('practicePlan.lesson')}
                value={item.materialId}
                onChange={(materialId) => changeItem(index, { kind: 'lesson', materialId })}
                options={levelLessons.map((m) => ({ value: m.id, label: m.title }))}
              />
            )}
            <Button variant="secondary" icon="delete" label={t('practicePlan.remove')} onPress={() => changeItem(index, null)} />
          </View>
        ))}
        {form.items.length < MAX_PLAN_ITEMS ? (
          <View style={styles.adds}>
            <Button
              variant="secondary"
              icon="taal"
              label={t('practicePlan.addTaal')}
              disabled={taals.length === 0}
              onPress={() => change({ items: [...form.items, { kind: 'taal', taalId: taals[0].id, bpmText: '60' }] })}
            />
            <Button
              variant="secondary"
              icon="lessonVideo"
              label={t('practicePlan.addLesson')}
              disabled={levelLessons.length === 0}
              onPress={() => change({ items: [...form.items, { kind: 'lesson', materialId: levelLessons[0].id }] })}
            />
            {levelLessons.length === 0 ? (
              <AppText variant="small" tone="muted">
                {t('practicePlan.noLessons')}
              </AppText>
            ) : null}
          </View>
        ) : null}
        <TextField
          label={t('practicePlan.note')}
          hint={t('practicePlan.noteHint', { max: PLAN_NOTE_MAX })}
          value={form.note}
          onChangeText={(note) => change({ note })}
          maxLength={PLAN_NOTE_MAX}
          multiline
        />
      </Section>

      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      <Button icon="check" label={t('practicePlan.save', { level: levelName(t, levelId) })} loading={saving} onPress={() => void save()} />
      {form.updatedAt ? (
        <AppText variant="small" tone="muted">
          {t('practicePlan.lastChanged', { date: formatDate(localDate(form.updatedAt)) })}
        </AppText>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  item: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  adds: {
    gap: spacing.sm,
  },
});
