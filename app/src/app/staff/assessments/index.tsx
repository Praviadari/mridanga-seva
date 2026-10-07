// C12 Assessments from the Guru (Phase 2), for coordinators and the Guru: every assessment the
// person may see, newest first, with its level, type, whether it is a level-up, and how many
// students have it in each state (to review first). Coordinators see those the Guru has sent; the
// Guru also sees drafts and has "Create assessment" (G6, ./new.tsx). Tapping one opens it with the
// tracker (./[id].tsx). Opened from the Assessments circle on the home's ring.
// Data: src/data/assessments.ts; who sees what is decided by the database (migration 0016).

import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-provider';
import { assessmentKindName } from '@/components/assessment-parts';
import { Button } from '@/components/button';
import { Columns } from '@/components/columns';
import { EmptyState } from '@/components/empty-state';
import { ListRow } from '@/components/list-row';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { fetchStaffAssessments, type StaffAssessmentItem } from '@/data/assessments';
import { levelName } from '@/i18n/labels';
import { formatDateTime } from '@/lib/dates';

/** The list of assessments. */
export default function StaffAssessmentsScreen() {
  const { t } = useTranslation();
  const { area } = useAuth();
  const isGuru = area === 'guru';
  // undefined = loading, null = could not load.
  const [items, setItems] = useState<StaffAssessmentItem[] | null | undefined>(undefined);

  const load = useCallback(async () => {
    setItems(await fetchStaffAssessments());
  }, []);

  // Reloads on coming back: after creating, releasing or reviewing, the counts change.
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
    <Screen underHeader wide onRefresh={load}>
      {header}
      {isGuru ? (
        <Button icon="add" label={t('assessments.create')} onPress={() => router.push('/staff/assessments/new')} />
      ) : (
        <Notice tone="info">{t('assessments.coordinatorIntro')}</Notice>
      )}
      {items === undefined ? <LoadingCards /> : null}
      {items && items.length === 0 ? (
        <EmptyState icon="assessment" title={isGuru ? t('assessments.emptyGuru') : t('assessments.emptyCoordinator')} />
      ) : null}
      <Columns>
        {items?.map(({ assessment: a, counts }) => (
          <ListRow
            key={a.id}
            leading="assessment"
            title={a.title}
            details={[
              [levelName(t, a.levelId), assessmentKindName(t, a.kind), ...(a.levelUp ? [t('assessments.levelUp')] : [])].join(' · '),
              a.sentAt
                ? t('assessments.sentOn', { date: formatDateTime(a.sentAt) })
                : t('assessments.draft'),
              counts.total > 0
                ? [
                    t('assessments.countStudents', { count: counts.total }),
                    ...(counts.submitted > 0 ? [t('assessments.countToReview', { count: counts.submitted })] : []),
                    t('assessments.countDone', { count: counts.reviewed }),
                  ].join(' · ')
                : t('assessments.notReleased'),
            ]}
            onPress={() => router.push({ pathname: '/staff/assessments/[id]', params: { id: String(a.id) } })}
          />
        ))}
      </Columns>
    </Screen>
  );
}
