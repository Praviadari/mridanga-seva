// S7 Assessments (Phase 2), for the student: the assessments the coordinators gave them, the ones
// still to send first (by due date), each with its status (Not seen, Seen, Submitted, Reviewed,
// Redo) and "Late" after the due date. Tapping one opens it (./[id].tsx). Opened from the
// Assessments circle on the student home's ring.
// Data: src/data/assessments.ts; a student sees only their own (migration 0016).

import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { assessmentKindName, assignmentStatusName } from '@/components/assessment-parts';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { ListRow } from '@/components/list-row';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { fetchMyAssessments, isOverdue, type MyAssessmentItem } from '@/data/assessments';
import { formatDate } from '@/lib/dates';

/** The student's list of assessments. */
export default function MyAssessmentsScreen() {
  const { t } = useTranslation();
  // undefined = loading, null = could not load.
  const [items, setItems] = useState<MyAssessmentItem[] | null | undefined>(undefined);

  const load = useCallback(async () => {
    setItems(await fetchMyAssessments());
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const header = <Stack.Screen options={{ title: t('assessments.title') }} />;

  if (items === null) {
    return (
      <Screen underHeader centred>
        {header}
        <Notice tone="error" title={t('assessments.loadFailed')}>
          {t('common.networkError')}
        </Notice>
        <Button icon="refresh" label={t('common.tryAgain')} onPress={() => void load()} />
      </Screen>
    );
  }

  return (
    <Screen underHeader onRefresh={load}>
      {header}
      {items === undefined ? <LoadingCards /> : null}
      {items && items.length === 0 ? (
        <EmptyState icon="assessment" title={t('assessments.emptyStudent')} body={t('assessments.emptyStudentBody')} />
      ) : null}
      {items?.map((item) => (
        <ListRow
          key={item.assignmentId}
          leading="assessment"
          title={item.title}
          highlighted={item.status === 'reviewed'}
          details={[
            [
              assignmentStatusName(t, item.status),
              ...(isOverdue(item) ? [t('assessments.late')] : []),
              ...(item.levelUp ? [t('assessments.levelUp')] : []),
            ].join(' · '),
            [assessmentKindName(t, item.kind), t('assessments.dueOn', { date: formatDate(item.dueOn) })].join(' · '),
          ]}
          onPress={() => router.push({ pathname: '/student/assessments/[id]', params: { id: String(item.assignmentId) } })}
        />
      ))}
    </Screen>
  );
}
