// C10 Follow-up queue, for coordinators and the Guru: students who have stopped coming, grouped
// by what needs doing: escalated to the Guru, calls due, calls later, and Irregular or Inactive
// students with no call planned. Within a group, the longest away comes first. Tapping a
// student opens the call screen (C11). Data: src/data/follow-up.ts; the rules that fill the
// queue are the daily job and log_call in the database (docs/DATABASE.md "Student status").

import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { ChoiceGroup } from '@/components/choice-group';
import { EmptyState } from '@/components/empty-state';
import { ListRow } from '@/components/list-row';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import {
  fetchFollowUpQueue,
  isMine,
  QUEUE_GROUPS,
  type FollowUpQueue,
  type QueueEntry,
} from '@/data/follow-up';
import { lastVisitText } from '@/i18n/labels';
import { formatDayMonthYear } from '@/lib/dates';

/** The queue in groups, with a "mine / everyone" switch and a refresh button. */
export default function FollowUpScreen() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const myId = profile?.id ?? null;
  // undefined = loading, null = could not load.
  const [queue, setQueue] = useState<FollowUpQueue | null | undefined>(undefined);
  const [scope, setScope] = useState<'everyone' | 'mine'>('everyone');

  const load = useCallback(async () => {
    setQueue(await fetchFollowUpQueue());
  }, []);

  // Reload when coming back from the call screen: the student moves group or leaves the queue.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const staffNames = useMemo(() => new Map((queue?.staff ?? []).map((s) => [s.id, s.fullName])), [queue]);
  const haveMine = !!queue?.entries.some((entry) => isMine(entry, myId));
  const entries = (queue?.entries ?? []).filter((entry) => scope === 'everyone' || isMine(entry, myId));

  /** The task line: "Call due 01-10-2026 · try 2 · for Radha", or "… · not given to anyone yet". */
  function taskText(entry: QueueEntry): string {
    const { task } = entry;
    if (!task) return t('followUp.noTask');
    return [
      t('followUp.due', { date: formatDayMonthYear(task.dueOn) }),
      task.attempt > 1 ? t('followUp.attempt', { number: task.attempt }) : null,
      task.assigneeId
        ? t('followUp.assignee', { name: staffNames.get(task.assigneeId) || t('profile.unknownPerson') })
        : t('followUp.unassigned'),
    ]
      .filter(Boolean)
      .join(' · ');
  }

  const header = <Stack.Screen options={{ title: t('followUp.title') }} />;

  if (queue === null) {
    return (
      <Screen underHeader centred>
        {header}
        <Notice tone="error" title={t('followUp.loadFailed')}>
          {t('common.networkError')}
        </Notice>
        <Button icon="refresh" label={t('common.tryAgain')} onPress={() => void load()} />
      </Screen>
    );
  }

  return (
    <Screen underHeader>
      {header}
      <AppText tone="muted">{t('followUp.intro')}</AppText>
      {haveMine ? (
        <ChoiceGroup
          label={t('followUp.scope')}
          choices={[
            { value: 'everyone', label: t('followUp.everyone') },
            { value: 'mine', label: t('students.filters.mine') },
          ]}
          value={scope}
          onChange={setScope}
        />
      ) : null}

      {queue === undefined ? <LoadingCards /> : null}
      {queue && entries.length === 0 ? <EmptyState icon="check" title={t('followUp.empty')} /> : null}

      {QUEUE_GROUPS.map((group) => {
        const inGroup = entries.filter((entry) => entry.group === group);
        if (inGroup.length === 0) return null;
        return [
          <AppText key={`${group}-title`} variant="subtitle">
            {t(`followUp.groups.${group}`, { number: inGroup.length })}
          </AppText>,
          group === 'escalated' ? (
            <AppText key={`${group}-help`} tone="muted">
              {t('followUp.escalatedHelp')}
            </AppText>
          ) : null,
          ...inGroup.map((entry) => (
            <ListRow
              key={entry.student.id}
              leading="initials"
              title={entry.student.fullName}
              chips={{ levelId: entry.student.levelId, status: entry.student.status }}
              details={[
                entry.student.rollNo,
                lastVisitText(t, entry.student),
                taskText(entry),
              ]}
              onPress={() => router.push({ pathname: '/staff/call/[id]', params: { id: entry.student.id } })}
            />
          )),
        ];
      })}

      <Button variant="secondary" icon="refresh" label={t('hereNow.refresh')} onPress={() => void load()} />
    </Screen>
  );
}
