// S4 My progress, for students: the syllabus of my current level in teaching order, with a tick
// and the date on the items I have shown in class, and a progress bar. Read-only: ticking is the
// coordinators' and the facilitator's (C9), and moving up a level is the facilitator's decision.
// Opened from the ring on the student home (S1). Data: fetchMyProgress in src/data/syllabus.ts.
// Lessons and materials for the level come later (docs/SCREENS.md S4).

import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { ListRow } from '@/components/list-row';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { ProgressBar } from '@/components/progress-bar';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { fetchMyProgress, type MyProgress } from '@/data/syllabus';
import { levelName } from '@/i18n/labels';
import { formatDayMonthYear } from '@/lib/dates';

/** The student's level with its progress bar and one row per syllabus item. */
export default function MyProgressScreen() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const myId = profile?.id ?? '';
  // undefined = loading, null = could not load, 'not_found' = no student record for this login.
  const [loaded, setLoaded] = useState<MyProgress | 'not_found' | null | undefined>(undefined);

  const load = useCallback(async () => {
    setLoaded(await fetchMyProgress(myId));
  }, [myId]);

  // Reload when the screen comes back into view, so a tick made in class shows at once.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const header = <Stack.Screen options={{ title: t('progress.title') }} />;

  if (loaded === undefined || loaded === null || loaded === 'not_found') {
    return (
      <Screen underHeader centred>
        {header}
        {loaded === undefined ? <LoadingCards /> : null}
        {loaded === 'not_found' ? (
          <Notice tone="info" title={t('myQr.noRecordTitle')}>
            {t('myQr.noRecordBody')}
          </Notice>
        ) : null}
        {loaded === null ? (
          <>
            <Notice tone="error" title={t('progress.loadFailed')}>
              {t('common.networkError')}
            </Notice>
            <Button icon="refresh" label={t('common.tryAgain')} onPress={() => void load()} />
          </>
        ) : null}
        <Button variant="link" icon="home" label={t('comingSoon.back')} onPress={() => router.navigate('/student')} />
      </Screen>
    );
  }

  const level = levelName(t, loaded.levelId);

  return (
    <Screen underHeader onRefresh={load}>
      {header}
      <Section icon="level" title={t('home.student.myLevel', { level })} description={t('progress.intro')}>
        {loaded.items.length > 0 ? (
          <ProgressBar
            done={loaded.done}
            total={loaded.items.length}
            label={t('syllabus.progressLabel', { level })}
            valueText={t('profile.syllabusDone', { done: loaded.done, total: loaded.items.length })}
          />
        ) : (
          <AppText tone="muted">{t('profile.noSyllabus')}</AppText>
        )}
      </Section>

      {loaded.items.length === 0 ? <EmptyState icon="syllabus" title={t('profile.noSyllabus')} /> : null}
      {loaded.items.map((item) => (
        <ListRow
          key={item.id}
          leading={item.doneOn ? 'check' : 'syllabus'}
          highlighted={item.doneOn !== null}
          title={`${item.sort}. ${item.title}`}
          details={[
            ...(item.description ? [item.description] : []),
            item.doneOn ? t('progress.doneOn', { date: formatDayMonthYear(item.doneOn) }) : t('progress.notYet'),
          ]}
        />
      ))}
    </Screen>
  );
}
