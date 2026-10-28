// Class progress (docs/RHYTHM_PLAYGROUND.md §10.1, §12.2; docs/DECISIONS.md #749): the students of a level or a group,
// "Ready for Review" first (to check in class or from a sent recording), then the longest without practice; per
// student the label of each skill with its sample size ("Steady · 17 of 20 right") and the last day played. Never a
// ranking and never a score. Labels are worked out here from the rounds of 30 days (staff_playground_class) with the
// published label rules and templates (lib/playground/labels.ts), as the student's own progress screen does.
// A row opens the Student profile.

import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/components/app-text';
import { ChoiceGroup } from '@/components/choice-group';
import { Columns } from '@/components/columns';
import { EmptyState } from '@/components/empty-state';
import { ListRow } from '@/components/list-row';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { fetchGroups, type GroupSummary } from '@/data/groups';
import { fetchClassPlayground, loadPlaygroundPack } from '@/data/playground';
import { LEVEL_IDS, levelName } from '@/i18n/labels';
import { formatDate } from '@/lib/dates';
import { DEFAULT_LABEL_RULES } from '@/lib/playground/labels';

import { classRows, type ClassRow } from './content-rules';
import { skillName } from './parts';

type Filter = { levelId: number } | { groupId: number };

/** The screen. */
export function ClassProgress() {
  const { t } = useTranslation();
  const [by, setBy] = useState<'level' | 'group'>('level');
  const [levelId, setLevelId] = useState<number>(1);
  const [groupId, setGroupId] = useState<number | null>(null);
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [rows, setRows] = useState<ClassRow[] | null | undefined>(undefined);
  const filter: Filter | null = by === 'level' ? { levelId } : groupId !== null ? { groupId } : null;
  const filterKey = filter ? JSON.stringify(filter) : '';

  useEffect(() => {
    let live = true;
    void fetchGroups().then((list) => {
      if (live) setGroups((list ?? []).filter((g) => g.active));
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!filterKey) return;
    let live = true;
    const wanted = JSON.parse(filterKey) as Filter;
    void Promise.all([fetchClassPlayground(wanted), loadPlaygroundPack()]).then(([students, packLoad]) => {
      if (!live) return;
      if (!students.data) {
        setRows(null);
        return;
      }
      const pack = packLoad.pack;
      setRows(classRows(students.data, pack?.templates ?? [], pack?.labels ?? DEFAULT_LABEL_RULES, Date.now()));
    });
    return () => {
      live = false;
    };
  }, [filterKey]);

  return (
    <Screen underHeader wide>
      <Stack.Screen options={{ title: t('staffPlayground.class.title') }} />
      <AppText tone="muted">{t('staffPlayground.class.intro')}</AppText>
      <ChoiceGroup<'level' | 'group'>
        segmented
        accessibilityLabel={t('staffPlayground.class.by')}
        value={by}
        onChange={(v) => {
          setBy(v);
          setRows(undefined);
        }}
        choices={[
          { value: 'level', label: t('staffPlayground.assign.aLevel') },
          { value: 'group', label: t('staffPlayground.assign.aGroup') },
        ]}
      />
      {by === 'level' ? (
        <ChoiceGroup<number>
          chips
          accessibilityLabel={t('staffPlayground.assign.aLevel')}
          value={levelId}
          onChange={(v) => {
            setLevelId(v);
            setRows(undefined);
          }}
          choices={LEVEL_IDS.map((l) => ({ value: l, label: levelName(t, l) }))}
        />
      ) : groups.length === 0 ? (
        <AppText tone="muted">{t('staffPlayground.assign.noGroups')}</AppText>
      ) : (
        <ChoiceGroup<number>
          chips
          accessibilityLabel={t('staffPlayground.assign.aGroup')}
          value={groupId}
          onChange={(v) => {
            setGroupId(v);
            setRows(undefined);
          }}
          choices={groups.map((g) => ({ value: g.id, label: g.name }))}
        />
      )}
      {filter && rows === undefined ? <LoadingCards /> : null}
      {rows === null ? <Notice tone="error">{t('common.networkError')}</Notice> : null}
      {rows && rows.length === 0 ? <EmptyState icon="students" title={t('staffPlayground.class.empty')} /> : null}
      <Columns>
        {rows?.map((row) => (
          <ListRow
            key={row.studentId}
            leading="initials"
            title={row.fullName}
            highlight={row.ready ? 'attention' : undefined}
            details={[
              row.ready ? t('staffPlayground.class.ready') : null,
              row.lastPlayed ? t('staffPlayground.class.last', { date: formatDate(row.lastPlayed.slice(0, 10)) }) : t('staffPlayground.class.notPlayed'),
              ...row.skills.map((s) =>
                [
                  `${skillName(t, s.skill)}: ${t(`playground.label.${s.label}`)}`,
                  s.correct !== null ? t('playground.progress.correct', { correct: s.correct, total: s.opportunities }) : t('playground.progress.rounds', { count: s.opportunities }),
                ].join(' · '),
              ),
            ].filter((x): x is string => !!x)}
            onPress={() => router.push({ pathname: '/staff/students/[id]', params: { id: row.studentId } })}
          />
        ))}
      </Columns>
    </Screen>
  );
}
