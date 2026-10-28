// One template: the rule of a challenge type (docs/RHYTHM_PLAYGROUND.md §8.3; docs/DECISIONS.md #744): id 'new' adds
// one. The game, the skill it counts for, how the student answers, the levels it covers, the difficulty steps and the
// parameters. Steps and parameters are typed as JSON (the keys the games read: choices, len, grid, gaps, closePairs,
// otherHead, extraTiles, tempoDiff, same; roundLen, reviewShare, gunaByLevel) — a facilitator's tool for the few
// templates a game needs, checked here and again by 0065 (template_invalid).

import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { ChoiceGroup } from '@/components/choice-group';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { RouteIdGuard } from '@/components/route-id-guard';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { TextField } from '@/components/text-field';
import { saveTemplate, type AdminTemplate } from '@/data/playground-admin';
import { LEVEL_IDS, levelName } from '@/i18n/labels';
import { GAME_IDS, SKILL_IDS, type GameId, type ResponseMode, type SkillId } from '@/lib/playground/types';

import { canEdit, readJson, stepsOk } from './content-rules';
import { gameName, skillName, StatusPanel, useAdminContent } from './parts';

const MODES: readonly ResponseMode[] = ['choose', 'order', 'tap', 'count', 'record', 'self_check'];

/** A new template's first guess per game: its skill, answer mode and steps (the TEST seed's shape). */
const STARTERS: Partial<Record<GameId, { skill: SkillId; mode: ResponseMode; steps: unknown[] }>> = {
  sound_detective: { skill: 'listen.stroke', mode: 'choose', steps: [{ step: 1, choices: 2, len: [1, 1], otherHead: true }, { step: 2, choices: 3, len: [1, 1] }, { step: 3, choices: 4, len: [1, 1] }, { step: 4, choices: 2, len: [1, 1], closePairs: true }] },
  missing_beat: { skill: 'listen.phrase', mode: 'choose', steps: [{ step: 1, choices: 3, gaps: 1, grid: true }, { step: 2, choices: 4, gaps: 1, grid: true }, { step: 3, choices: 4, gaps: 1, grid: false }, { step: 4, choices: 4, gaps: 2, grid: true }] },
  rhythm_builder: { skill: 'rhythm.sequence', mode: 'order', steps: [{ step: 1, extraTiles: 0, grid: true }, { step: 2, extraTiles: 1, grid: true }, { step: 3, extraTiles: 2, grid: false }] },
  tempo_detective: { skill: 'listen.tempo', mode: 'choose', steps: [{ step: 1, tempoDiff: 0.25 }, { step: 2, tempoDiff: 0.15 }, { step: 3, tempoDiff: 0.08 }] },
};

/** The screen: waits for the content, then the form. */
function TemplateEditorContent() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const { content, reload } = useAdminContent();
  const row = content && !isNew ? (content.templates.find((x) => String(x.id) === id) ?? null) : null;
  const title = isNew ? t('staffPlayground.template.newTitle') : t('staffPlayground.template.editTitle');

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
      <TemplateForm key={row ? `${row.id}-${row.updatedAt}` : 'new'} row={row} />
      {row ? <StatusPanel kind="template" id={row.id} row={row} onChanged={() => void reload()} /> : null}
    </Screen>
  );
}

const pretty = (value: unknown) => JSON.stringify(value, null, 1).replace(/\n\s*/g, ' ');

function TemplateForm({ row }: { row: AdminTemplate | null }) {
  const { t } = useTranslation();
  const editable = canEdit(row, true);
  const [game, setGame] = useState<GameId>(row?.game ?? 'sound_detective');
  const [skill, setSkill] = useState<SkillId>(row?.skill ?? 'listen.stroke');
  const [mode, setMode] = useState<ResponseMode>(row?.responseMode ?? 'choose');
  const [levelMin, setLevelMin] = useState<number>(row?.levelMin ?? 1);
  const [levelMax, setLevelMax] = useState<number>(row?.levelMax ?? 1);
  const [steps, setSteps] = useState(pretty(row?.steps ?? STARTERS.sound_detective?.steps ?? [{ step: 1 }]));
  const [params, setParams] = useState(pretty(row?.params ?? { roundLen: 6 }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickGame = (value: GameId) => {
    setGame(value);
    const starter = STARTERS[value];
    if (!row && starter) {
      setSkill(starter.skill);
      setMode(starter.mode);
      setSteps(pretty(starter.steps));
    }
  };

  const save = async () => {
    const stepList = readJson(steps, 'array');
    const paramObject = readJson(params, 'object');
    if (!Array.isArray(stepList) || !stepsOk(stepList)) {
      setError(t('staffPlayground.template.stepsProblem'));
      return;
    }
    if (!paramObject || Array.isArray(paramObject)) {
      setError(t('staffPlayground.template.paramsProblem'));
      return;
    }
    if (levelMin > levelMax) {
      setError(t('staffPlayground.template.levelsProblem'));
      return;
    }
    setSaving(true);
    setError(null);
    const result = await saveTemplate(row?.id ?? null, { game, skill, responseMode: mode, levelMin, levelMax, steps: stepList, params: paramObject });
    setSaving(false);
    if ('errorKey' in result) setError(t(result.errorKey));
    else router.back();
  };

  return (
    <>
      <Section icon="settings" title={t('staffPlayground.template.fields')}>
        <ChoiceGroup<GameId> chips label={t('staffPlayground.game')} value={game} onChange={(v) => editable && pickGame(v)} choices={GAME_IDS.map((value) => ({ value, label: gameName(t, value) }))} />
        <ChoiceGroup<SkillId> chips label={t('staffPlayground.skill')} value={skill} onChange={(v) => editable && setSkill(v)} choices={SKILL_IDS.map((value) => ({ value, label: skillName(t, value) }))} />
        <ChoiceGroup<ResponseMode> chips label={t('staffPlayground.template.mode')} value={mode} onChange={(v) => editable && setMode(v)} choices={MODES.map((value) => ({ value, label: t(`staffPlayground.template.mode_${value}`) }))} />
        <ChoiceGroup<number> chips label={t('staffPlayground.template.levelMin')} value={levelMin} onChange={(v) => editable && setLevelMin(v)} choices={LEVEL_IDS.map((l) => ({ value: l, label: levelName(t, l) }))} />
        <ChoiceGroup<number> chips label={t('staffPlayground.template.levelMax')} value={levelMax} onChange={(v) => editable && setLevelMax(v)} choices={LEVEL_IDS.map((l) => ({ value: l, label: levelName(t, l) }))} />
        <TextField label={t('staffPlayground.template.steps')} hint={t('staffPlayground.template.stepsHint')} value={steps} onChangeText={setSteps} multiline autoCapitalize="none" autoCorrect={false} editable={editable} />
        <TextField label={t('staffPlayground.template.params')} hint={t('staffPlayground.template.paramsHint')} value={params} onChangeText={setParams} multiline autoCapitalize="none" autoCorrect={false} editable={editable} />
        <AppText variant="small" tone="muted">
          {t('staffPlayground.template.keys')}
        </AppText>
      </Section>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {editable ? <Button icon="check" label={t('staffPlayground.saveDraft')} loading={saving} onPress={() => void save()} /> : null}
    </>
  );
}

/** Checks the address's id before the screen loads anything (D6-07). */
export function TemplateEditor() {
  return (
    <RouteIdGuard kind="number" allowNew>
      <TemplateEditorContent />
    </RouteIdGuard>
  );
}
