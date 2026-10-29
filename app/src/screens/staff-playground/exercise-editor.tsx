// Add or edit an exercise of the bank (docs/RHYTHM_PLAYGROUND.md §8.3-§8.5, §10.1; docs/DECISIONS.md #745): id 'new'
// adds one. The game, the level, its template and skill; the pattern in the taal notation (as the class writes it —
// "te.re khe ta -" — stored as dictionary ids), with its beat grid, or copied from a taal; vibhags; the answer when
// it is not the whole pattern; approved distractors; the tempo range and guna; recorded prompts; attribution.
// "Preview generated variants": five sample challenges from W1's generator on the form as it stands (same seeds
// for everyone, nothing saved), so a facilitator sees what students would get before sending it for approval.

import { router, Stack, useLocalSearchParams } from 'expo-router';
import type { TFunction } from 'i18next';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/components/app-text';
import { BeatGrid } from '@/components/beat-grid';
import { Button } from '@/components/button';
import { Checkbox } from '@/components/checkbox';
import { ChoiceGroup } from '@/components/choice-group';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { RouteIdGuard } from '@/components/route-id-guard';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { TextField } from '@/components/text-field';
import { saveExercise, type AdminContent, type AdminExercise } from '@/data/playground-admin';
import { fetchAllTaals, type Taal } from '@/data/practice';
import { LEVEL_IDS, levelName } from '@/i18n/labels';
import { bolIndex, plainBeat, sequenceBols, writtenKey, type BolIndex } from '@/lib/playground/notation';
import { GAME_IDS, SKILL_IDS, type Challenge, type GameId, type SkillId } from '@/lib/playground/types';

import { canEdit, previewRounds, PREVIEW_SEEDS, readBeats, readBpm, readDistractors, readDivisions, templateOf } from './content-rules';
import { gameName, skillName, StatusPanel, useAdminContent } from './parts';

/** The class's guna (team Beginner Lesson 3: Vilambit, Madhya, Drut, Ati Drut; #774 closes D3). No 3. */
const GUNAS: readonly number[] = [1, 2, 4, 8];
/** Games whose answer may differ from the whole pattern (0065 play_expected). */
const ANSWER_KEY: Partial<Record<GameId, 'bols' | 'order' | 'instruments'>> = { sound_detective: 'bols', rhythm_builder: 'order', sound_explorer: 'instruments' };

/** The screen: waits for the content, then the form. */
function ExerciseEditorContent() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const { content, reload } = useAdminContent();
  const row = content && !isNew ? (content.exercises.find((x) => String(x.id) === id) ?? null) : null;
  const title = isNew ? t('staffPlayground.exercise.newTitle') : t('staffPlayground.exercise.editTitle');

  if (content === undefined) {
    return (
      <Screen underHeader>
        <Stack.Screen options={{ title }} />
        <LoadingCards />
      </Screen>
    );
  }
  if (content === null || (!isNew && !row)) {
    return (
      <Screen underHeader centred>
        <Stack.Screen options={{ title }} />
        <Notice tone="error">{content === null ? t('common.networkError') : t('playEngine.errors.contentNotFound')}</Notice>
      </Screen>
    );
  }
  return (
    <Screen underHeader>
      <Stack.Screen options={{ title }} />
      <ExerciseForm key={row ? `${row.id}-${row.updatedAt}` : 'new'} row={row} content={content} />
      {row ? <StatusPanel kind="exercise" id={row.id} row={row} onChanged={() => void reload()} /> : null}
    </Screen>
  );
}

function ExerciseForm({ row, content }: { row: AdminExercise | null; content: AdminContent }) {
  const { t } = useTranslation();
  const editable = canEdit(row, true);
  const [game, setGame] = useState<GameId>(row?.game ?? 'sound_detective');
  const [levelId, setLevelId] = useState<number>(row?.levelId ?? 1);
  const [templateId, setTemplateId] = useState<number>(row?.templateId ?? 0);
  const [skill, setSkill] = useState<SkillId>(row?.skills[0] ?? 'listen.stroke');
  const [taalId, setTaalId] = useState<number | null>(row?.taalId ?? null);
  const [sequence, setSequence] = useState((row?.sequence ?? []).join(' '));
  const [divisions, setDivisions] = useState((row?.divisions ?? []).join(' '));
  const answerKind = ANSWER_KEY[game];
  const [answer, setAnswer] = useState(() => {
    const a = row?.answer;
    return (a?.bols ?? a?.order ?? a?.instruments ?? []).join(a?.instruments ? ', ' : ' ');
  });
  const [distractors, setDistractors] = useState((row?.distractors ?? []).join('\n'));
  const [bpmMin, setBpmMin] = useState(row && row.bpmMin !== null ? String(row.bpmMin) : '');
  const [bpmMax, setBpmMax] = useState(row && row.bpmMax !== null ? String(row.bpmMax) : '');
  // A row from before #774 may hold guna 3: it is not offered, so it is left out here and dropped on the next save.
  const [guna, setGuna] = useState<number[]>((row?.guna ?? [1]).filter((g) => GUNAS.includes(g)));
  const [promptAssets, setPromptAssets] = useState<number[]>(row?.promptAssets ?? []);
  const [attribution, setAttribution] = useState(row?.attribution ?? '');
  const [taals, setTaals] = useState<Taal[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void fetchAllTaals().then((list) => {
      if (live) setTaals(list ?? []);
    });
    return () => {
      live = false;
    };
  }, []);

  const index = useMemo(() => bolIndex(content.bols), [content.bols]);
  const beats = readBeats(sequence);
  const hasSequence = sequence.trim() !== '';
  const vibhags = readDivisions(divisions, beats.beats.length);
  const answerBeats = answerKind && answerKind !== 'instruments' && answer.trim() ? readBeats(answer) : null;
  const instruments = answerKind === 'instruments' ? answer.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean) : [];
  const extra = readDistractors(distractors);
  const lo = readBpm(bpmMin);
  const hi = readBpm(bpmMax);
  const templates = content.templates.filter((x) => x.game === game && (x.status !== 'retired' || x.id === row?.templateId));
  const prompts = content.assets.filter((a) => a.kind !== 'stroke' && (a.status !== 'retired' || promptAssets.includes(a.id)));
  const used = sequenceBols([...(hasSequence ? beats.beats : []), ...(answerBeats?.beats ?? []), ...extra.distractors.flatMap((d) => d.split(' '))]);
  const notApproved = used.filter((b) => index.get(b) === undefined || content.bols.find((x) => x.id === b)?.status !== 'approved');

  const problem = (): string | null => {
    if (hasSequence && beats.problem) return t(`staffPlayground.exercise.problem_${beats.problem}`);
    if (!hasSequence && promptAssets.length === 0) return t('staffPlayground.exercise.needPattern');
    if (vibhags.problem) return t('staffPlayground.exercise.divisionsProblem');
    if (answerBeats?.problem) return t('staffPlayground.exercise.answerProblem');
    if (extra.problem) return t('staffPlayground.exercise.distractorsProblem');
    if (lo.problem || hi.problem || (lo.bpm !== null && hi.bpm !== null && lo.bpm > hi.bpm)) return t('staffPlayground.exercise.bpmProblem');
    if (guna.length === 0) return t('staffPlayground.exercise.gunaProblem');
    return null;
  };

  const answerJson = (): Record<string, unknown> => {
    if (answerKind === 'instruments') return instruments.length ? { instruments } : {};
    if (answerKind && answerBeats && !answerBeats.problem) return { [answerKind]: answerBeats.beats };
    return {};
  };

  const draft: AdminExercise = {
    ...(row ?? { id: 0, status: 'draft', revision: 1, placeholder: false, publishedIn: null, firstPublishedIn: null, createdBy: null, updatedAt: '', locale: 'en', requiresItem: null }),
    game,
    templateId: templateId === 0 ? null : templateId,
    levelId,
    skills: [skill],
    taalId,
    sequence: hasSequence && !beats.problem ? beats.beats : null,
    divisions: vibhags.divisions,
    answer: answerJson(),
    distractors: extra.distractors,
    promptAssets,
    bpmMin: lo.bpm,
    bpmMax: hi.bpm,
    guna,
    attribution: attribution || null,
  };

  const fromTaal = (taal: Taal) => {
    setTaalId(taal.id);
    setSequence(taal.bols.map(plainBeat).join(' '));
    setDivisions(taal.divisions.join(' '));
  };

  const save = async () => {
    const p = problem();
    if (p) {
      setError(p);
      return;
    }
    setSaving(true);
    setError(null);
    const result = await saveExercise(row?.id ?? null, {
      game: draft.game,
      templateId: draft.templateId,
      levelId: draft.levelId,
      skills: draft.skills,
      taalId: draft.taalId,
      sequence: draft.sequence,
      divisions: draft.divisions,
      answer: draft.answer,
      distractors: draft.distractors,
      promptAssets: draft.promptAssets,
      bpmMin: draft.bpmMin,
      bpmMax: draft.bpmMax,
      guna: draft.guna,
      attribution,
    });
    setSaving(false);
    if ('errorKey' in result) setError(t(result.errorKey));
    else router.back();
  };

  const pickGame = (value: GameId) => {
    setGame(value);
    setTemplateId(0);
  };
  const pickTemplate = (value: number) => {
    setTemplateId(value);
    const tpl = content.templates.find((x) => x.id === value);
    if (tpl) setSkill(tpl.skill);
  };
  const toggle = (list: number[], value: number, on: boolean) => (on ? [...list, value].sort((a, b) => a - b) : list.filter((x) => x !== value));

  return (
    <>
      <Section icon="practice" title={t('staffPlayground.exercise.fields')}>
        <ChoiceGroup<GameId> chips label={t('staffPlayground.game')} value={game} onChange={(v) => editable && pickGame(v)} choices={GAME_IDS.map((value) => ({ value, label: gameName(t, value) }))} />
        <ChoiceGroup<number> chips label={t('staffPlayground.exercise.level')} value={levelId} onChange={(v) => editable && setLevelId(v)} choices={LEVEL_IDS.map((l) => ({ value: l, label: levelName(t, l) }))} />
        <ChoiceGroup<number>
          chips
          label={t('staffPlayground.exercise.template')}
          value={templateId}
          onChange={(v) => editable && pickTemplate(v)}
          choices={[{ value: 0, label: t('staffPlayground.exercise.usualTemplate') }, ...templates.map((x) => ({ value: x.id, label: `#${x.id} · ${skillName(t, x.skill)}` }))]}
        />
        <ChoiceGroup<SkillId> chips label={t('staffPlayground.skill')} value={skill} onChange={(v) => editable && setSkill(v)} choices={SKILL_IDS.map((value) => ({ value, label: skillName(t, value) }))} />
      </Section>

      <Section icon="taal" title={t('staffPlayground.exercise.pattern')}>
        <TextField label={t('staffPlayground.exercise.sequence')} hint={t('staffPlayground.exercise.sequenceHint')} value={sequence} onChangeText={setSequence} autoCapitalize="none" autoCorrect={false} multiline editable={editable} />
        {editable && taals.length > 0 ? (
          <ChoiceGroup<number>
            chips
            label={t('staffPlayground.exercise.fromTaal')}
            value={taalId}
            onChange={(v) => {
              const taal = taals.find((x) => x.id === v);
              if (taal) fromTaal(taal);
            }}
            choices={taals.map((x) => ({ value: x.id, label: x.name }))}
          />
        ) : null}
        <TextField label={t('staffPlayground.exercise.divisions')} hint={t('staffPlayground.exercise.divisionsHint', { beats: beats.beats.length })} value={divisions} onChangeText={setDivisions} editable={editable} />
        {hasSequence && !beats.problem ? (
          <BeatGrid
            bols={beats.beats.map((b) => writtenKey(b, index))}
            divisions={vibhags.divisions ?? [beats.beats.length]}
            marks={(vibhags.divisions ?? [beats.beats.length]).map((_, i) => (i === 0 ? 'X' : String(i + 1)))}
            current={null}
          />
        ) : null}
        {notApproved.length > 0 ? <Notice tone="warning">{t('staffPlayground.exercise.bolsNotApproved', { bols: notApproved.join(', ') })}</Notice> : null}
        {answerKind ? (
          <TextField
            label={t(`staffPlayground.exercise.answer_${answerKind}`)}
            hint={t(`staffPlayground.exercise.answerHint_${answerKind}`)}
            value={answer}
            onChangeText={setAnswer}
            autoCapitalize="none"
            editable={editable}
          />
        ) : null}
        <TextField label={t('staffPlayground.exercise.distractors')} hint={t('staffPlayground.exercise.distractorsHint')} value={distractors} onChangeText={setDistractors} autoCapitalize="none" multiline editable={editable} />
      </Section>

      <Section icon="time" title={t('staffPlayground.exercise.tempo')}>
        <TextField label={t('staffPlayground.exercise.bpmMin')} value={bpmMin} onChangeText={setBpmMin} kind="decimal" editable={editable} />
        <TextField label={t('staffPlayground.exercise.bpmMax')} value={bpmMax} onChangeText={setBpmMax} kind="decimal" editable={editable} />
        <AppText variant="label">{t('staffPlayground.exercise.guna')}</AppText>
        {GUNAS.map((g) => (
          <Checkbox key={g} label={t('staffPlayground.exercise.gunaN', { n: g })} checked={guna.includes(g)} onChange={(on) => editable && setGuna(toggle(guna, g, on))} />
        ))}
      </Section>

      {prompts.length > 0 ? (
        <Section icon="audio" title={t('staffPlayground.exercise.prompts')} description={t('staffPlayground.exercise.promptsHint')}>
          {prompts.map((a) => (
            <Checkbox
              key={a.id}
              label={`${t(`staffPlayground.sound.kind_${a.kind}`)} #${a.id}${a.performer ? ` · ${a.performer}` : ''}`}
              checked={promptAssets.includes(a.id)}
              onChange={(on) => editable && setPromptAssets(toggle(promptAssets, a.id, on))}
            />
          ))}
        </Section>
      ) : null}

      <Section icon="about" title={t('staffPlayground.exercise.more')}>
        <TextField label={t('staffPlayground.exercise.attribution')} value={attribution} onChangeText={setAttribution} maxLength={200} editable={editable} />
      </Section>

      {error ? <Notice tone="error">{error}</Notice> : null}
      {editable ? <Button icon="check" label={t('staffPlayground.saveDraft')} loading={saving} onPress={() => void save()} /> : null}

      <Preview exercise={draft} content={content} index={index} ready={problem() === null} />
    </>
  );
}

/** One sample challenge in words: what plays, the cards, the answer. */
function challengeText(t: TFunction, c: Challenge, index: BolIndex): string {
  const parts = [t('staffPlayground.preview.plays', { beats: writtenKey(c.prompt.beats.join(' '), index), bpm: c.prompt.bpm })];
  if (c.prompt.gaps.length > 0) parts.push(t('staffPlayground.preview.gaps', { places: c.prompt.gaps.map((g) => g + 1).join(', ') }));
  if (c.prompt.second) parts.push(t('staffPlayground.preview.second', { bpm: c.prompt.second.bpm }));
  if (c.choices.length > 0) parts.push(t('staffPlayground.preview.cards', { cards: c.choices.map((x) => writtenKey(x.key, index)).join(' / ') }));
  parts.push(t('staffPlayground.preview.answer', { answer: ['faster', 'slower', 'same'].includes(c.answer) ? t(`playground.td.${c.answer as 'faster' | 'slower' | 'same'}`) : writtenKey(c.answer, index) }));
  return parts.join(' · ');
}

/** Five sample challenges at a chosen step (the template's steps). */
function Preview({ exercise, content, index, ready }: { exercise: AdminExercise; content: AdminContent; index: BolIndex; ready: boolean }) {
  const { t } = useTranslation();
  const template = templateOf(exercise, content.templates);
  const steps = template ? template.steps.map((s) => s.step).sort((a, b) => a - b) : [1];
  const [step, setStep] = useState<number>(steps[0] ?? 1);
  const [shown, setShown] = useState(false);
  const rounds = shown && ready ? previewRounds(exercise, content, step) : null;

  return (
    <Section icon="play" title={t('staffPlayground.preview.title')} description={t('staffPlayground.preview.intro')}>
      {!template ? <Notice tone="warning">{t('staffPlayground.preview.noTemplate')}</Notice> : null}
      {steps.length > 1 ? (
        <ChoiceGroup<number> chips label={t('playground.round.step')} value={step} onChange={setStep} choices={steps.map((s) => ({ value: s, label: t('playground.round.stepChoice', { n: s }) }))} />
      ) : null}
      {!ready ? <AppText tone="muted">{t('staffPlayground.preview.fixFirst')}</AppText> : null}
      {ready && !shown ? <Button variant="secondary" icon="play" label={t('staffPlayground.preview.show')} onPress={() => setShown(true)} /> : null}
      {rounds?.map((r, i) => {
        const c = r.challenges[0];
        const dropped = r.dropped[0];
        return (
          <AppText key={PREVIEW_SEEDS[i]}>
            {`${t('staffPlayground.preview.sample', { n: i + 1 })}: `}
            {c ? challengeText(t, c, index) : dropped ? t(`staffPlayground.preview.dropped_${dropped.reason}`) : t('staffPlayground.preview.nothing')}
          </AppText>
        );
      })}
    </Section>
  );
}

/** Checks the address's id before the screen loads anything (D6-07). */
export function ExerciseEditor() {
  return (
    <RouteIdGuard kind="number" allowNew>
      <ExerciseEditorContent />
    </RouteIdGuard>
  );
}
