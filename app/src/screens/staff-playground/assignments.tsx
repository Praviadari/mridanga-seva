// Assignments (docs/RHYTHM_PLAYGROUND.md §8.5 rule 7, §8.8, §10.1; docs/DECISIONS.md #748): a facilitator assigns a
// game (or one skill of it) and a step range to a level, a group (e.g. "Playground pilot") or one student (opened
// from the Student profile), from today, with an optional due day in 1, 2 or 4 weeks and a note. Assigned items come
// first in the student's rounds; the step range is the facilitator's override. The running and coming assignments
// are listed with End (asks once more). Any facilitator; play_assignments, staff only.

import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { ChoiceGroup } from '@/components/choice-group';
import { ListRow } from '@/components/list-row';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { TextField } from '@/components/text-field';
import { fetchGroups, type GroupSummary } from '@/data/groups';
import { addAssignment, fetchAssignments, removeAssignment, type AdminAssignment } from '@/data/playground-admin';
import { LEVEL_IDS, levelName } from '@/i18n/labels';
import { formatDate, todayLocal } from '@/lib/dates';
import { GAME_IDS, SKILL_IDS, type GameId, type SkillId } from '@/lib/playground/types';

import { dueAfter } from './content-rules';
import { gameName, skillName } from './parts';

type Target = 'level' | 'group' | 'student';
const STEPS = [0, 1, 2, 3, 4, 5, 6] as const;
const DUE = [0, 1, 2, 4] as const;

/** The screen. */
export function AssignmentsScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ student?: string; name?: string }>();
  const student = typeof params.student === 'string' && /^[0-9a-f-]{36}$/i.test(params.student) ? params.student : null;
  const [list, setList] = useState<AdminAssignment[] | null | undefined>(undefined);
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [game, setGame] = useState<GameId>('sound_detective');
  const [skill, setSkill] = useState<SkillId | ''>('');
  const [target, setTarget] = useState<Target>(student ? 'student' : 'level');
  const [levelId, setLevelId] = useState<number>(1);
  const [groupId, setGroupId] = useState<number | null>(null);
  const [stepMin, setStepMin] = useState<number>(0);
  const [stepMax, setStepMax] = useState<number>(0);
  const [due, setDue] = useState<number>(0);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [ending, setEnding] = useState<number | null>(null);

  const load = useCallback(async () => {
    const [assignments, allGroups] = await Promise.all([fetchAssignments(todayLocal()), fetchGroups()]);
    setList(assignments);
    setGroups((allGroups ?? []).filter((g) => g.active));
  }, []);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const shown = list ? (student ? list.filter((a) => a.studentId === student || a.studentId === null) : list) : null;

  const add = async () => {
    if (target === 'group' && groupId === null) {
      setError(t('staffPlayground.assign.chooseGroup'));
      return;
    }
    if (stepMin && stepMax && stepMin > stepMax) {
      setError(t('staffPlayground.assign.stepsProblem'));
      return;
    }
    setBusy(true);
    setError(null);
    setSaved(false);
    const errorKey = await addAssignment({
      game,
      skill: skill || null,
      target: target === 'student' && student ? { studentId: student } : target === 'group' && groupId !== null ? { groupId } : { levelId },
      stepMin: stepMin || null,
      stepMax: stepMax || null,
      dueDay: dueAfter(todayLocal(), due || null),
      note,
    });
    setBusy(false);
    if (errorKey) {
      setError(t(errorKey));
      return;
    }
    setSaved(true);
    setNote('');
    void load();
  };

  const end = async (id: number) => {
    if (ending !== id) {
      setEnding(id);
      return;
    }
    setEnding(null);
    const errorKey = await removeAssignment(id);
    if (errorKey) setError(t(errorKey));
    void load();
  };

  const targetText = (a: AdminAssignment) =>
    a.studentId ? (a.studentName ?? t('staffPlayground.assign.oneStudent')) : a.groupId ? t('staffPlayground.assign.groupIs', { name: a.groupName ?? '' }) : levelName(t, a.levelId ?? 1);

  return (
    <Screen underHeader>
      <Stack.Screen options={{ title: t('staffPlayground.assign.title') }} />
      <AppText tone="muted">{t('staffPlayground.assign.intro')}</AppText>
      <Section icon="add" title={t('staffPlayground.assign.new')}>
        <ChoiceGroup<GameId> chips label={t('staffPlayground.game')} value={game} onChange={setGame} choices={GAME_IDS.map((value) => ({ value, label: gameName(t, value) }))} />
        <ChoiceGroup<SkillId | ''>
          chips
          label={t('staffPlayground.assign.skill')}
          value={skill}
          onChange={setSkill}
          choices={[{ value: '', label: t('staffPlayground.assign.anySkill') }, ...SKILL_IDS.map((value) => ({ value, label: skillName(t, value) }))]}
        />
        <ChoiceGroup<Target>
          segmented
          label={t('staffPlayground.assign.who')}
          value={target}
          onChange={setTarget}
          choices={[
            { value: 'level', label: t('staffPlayground.assign.aLevel') },
            { value: 'group', label: t('staffPlayground.assign.aGroup') },
            ...(student ? [{ value: 'student' as const, label: params.name || t('staffPlayground.assign.oneStudent') }] : []),
          ]}
        />
        {target === 'level' ? (
          <ChoiceGroup<number> chips accessibilityLabel={t('staffPlayground.assign.aLevel')} value={levelId} onChange={setLevelId} choices={LEVEL_IDS.map((l) => ({ value: l, label: levelName(t, l) }))} />
        ) : null}
        {target === 'group' ? (
          groups.length === 0 ? (
            <AppText tone="muted">{t('staffPlayground.assign.noGroups')}</AppText>
          ) : (
            <ChoiceGroup<number> chips accessibilityLabel={t('staffPlayground.assign.aGroup')} value={groupId} onChange={setGroupId} choices={groups.map((g) => ({ value: g.id, label: g.name }))} />
          )
        ) : null}
        <ChoiceGroup<number> chips label={t('staffPlayground.assign.stepMin')} value={stepMin} onChange={setStepMin} choices={STEPS.map((s) => ({ value: s, label: s === 0 ? t('staffPlayground.assign.noLimit') : String(s) }))} />
        <ChoiceGroup<number> chips label={t('staffPlayground.assign.stepMax')} value={stepMax} onChange={setStepMax} choices={STEPS.map((s) => ({ value: s, label: s === 0 ? t('staffPlayground.assign.noLimit') : String(s) }))} />
        <ChoiceGroup<number>
          chips
          label={t('staffPlayground.assign.due')}
          value={due}
          onChange={setDue}
          choices={DUE.map((w) => ({ value: w, label: w === 0 ? t('staffPlayground.assign.noDue') : t('staffPlayground.assign.weeks', { count: w }) }))}
        />
        <TextField label={t('staffPlayground.assign.note')} value={note} onChangeText={setNote} maxLength={200} />
        {error ? <Notice tone="error">{error}</Notice> : null}
        {saved ? <Notice tone="success" announced>{t('staffPlayground.assign.saved')}</Notice> : null}
        <Button icon="check" label={t('staffPlayground.assign.add')} loading={busy} onPress={() => void add()} />
      </Section>
      <Section icon="todo" title={t('staffPlayground.assign.running')}>
        {shown === undefined ? <LoadingCards /> : null}
        {shown === null ? <Notice tone="error">{t('common.networkError')}</Notice> : null}
        {shown && shown.length === 0 ? <AppText tone="muted">{t('staffPlayground.assign.none')}</AppText> : null}
        {shown?.map((a) => (
          <ListRow
            key={a.id}
            title={`${gameName(t, a.game)}${a.skill ? ` · ${skillName(t, a.skill)}` : ''}`}
            details={[
              targetText(a),
              a.stepMin || a.stepMax ? t('staffPlayground.assign.stepsAre', { from: a.stepMin ?? 1, to: a.stepMax ?? '…' }) : null,
              a.dueDay ? t('staffPlayground.assign.dueOn', { date: formatDate(a.dueDay) }) : t('staffPlayground.assign.fromOn', { date: formatDate(a.fromDay) }),
              a.note,
            ].filter((x): x is string => !!x)}
            action={{ label: ending === a.id ? t('staffPlayground.assign.confirmEnd') : t('staffPlayground.assign.end'), variant: 'secondary', onPress: () => void end(a.id) }}
          />
        ))}
      </Section>
    </Screen>
  );
}
