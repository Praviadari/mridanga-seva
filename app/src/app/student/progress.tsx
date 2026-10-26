// S4 My progress, for students: the syllabus of my current level in teaching order, with a tick
// and the date on the items I have shown in class, and a progress bar. Read-only: ticking is the
// coordinators' and the facilitator's (C9), and moving up a level is the facilitator's decision.
// Opened from the ring on the student home (S1). Data: fetchMyProgress in src/data/syllabus.ts.
// Since round 7 each item shows its lessons and materials (YouTube videos open in the YouTube app
// or the browser, PDFs and photos in the browser; components/material-row.tsx), and the lessons for
// the whole level come first. An item the facilitator retired shows only when it was ticked, and
// does not count (docs/DECISIONS.md #44).
// Also Me > My progress in the staff app, for a staff member's own record (0053, #319; staff/me/progress.tsx).
// Since 24-10-2026 the bar is the level path (components/level-path-view.tsx, #620).

import { router, Stack, useFocusEffect, usePathname } from 'expo-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { LevelPathView } from '@/components/level-path-view';
import { ListRow } from '@/components/list-row';
import { MaterialRow } from '@/components/material-row';
import { PracticePanel } from '@/components/practice-parts';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { fetchMyProgress, type MyProgress } from '@/data/syllabus';
import { LEVEL_IDS, levelName } from '@/i18n/labels';
import { formatDate } from '@/lib/dates';
import { levelPath } from '@/lib/level-path';
import { ownAreaOf } from '@/lib/own-area';
import { spacing } from '@/theme/use-theme';
import { RefreshFailed } from '@/components/refresh-failed';
import { useKeptLoad } from '@/lib/kept-load';

/** The student's level with its progress bar and one row per syllabus item. */
export default function MyProgressScreen() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const myId = profile?.id ?? '';
  const area = ownAreaOf(usePathname());
  // undefined = loading, null = could not load, 'not_found' = no student record for this login.
  const [loaded, setLoaded, refreshFailed] = useKeptLoad<MyProgress | 'not_found' | null | undefined>();

  const load = useCallback(async () => {
    setLoaded(await fetchMyProgress(myId));
  }, [myId, setLoaded]);

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
        <Button variant="link" icon="home" label={t('comingSoon.back')} onPress={() => router.dismissTo(area === 'me' ? '/staff/me' : '/student')} />
      </Screen>
    );
  }

  const level = levelName(t, loaded.levelId);
  const levelWide = loaded.materials.filter((m) => m.itemId === null);
  // Numbered in teaching order among the items in use (retired ones carry no number).
  const inUse = loaded.items.filter((item) => !item.retired);

  return (
    <Screen underHeader onRefresh={load}>
      {/* F9 (#327): a failed refresh keeps what is shown and says so. */}
      <RefreshFailed at={refreshFailed} onRetry={() => load()} />
      {header}
      <Section icon="level" title={t('home.student.myLevel', { level })} description={t('progress.intro')}>
        {/* The level path (#620): "7 of 20 in Beginner", the next items to learn, the level after. */}
        {loaded.total > 0 ? (
          <LevelPathView path={levelPath(loaded.items, loaded.levelId, LEVEL_IDS)} />
        ) : (
          <AppText tone="muted">{t('profile.noSyllabus')}</AppText>
        )}
      </Section>

      {/* Phase 2 slice 3 (docs/DECISIONS.md #54): weekly practice, opens S6. */}
      <PracticePanel profileId={myId} />

      {levelWide.length > 0 ? (
        <Section icon="library" title={t('progress.levelLessons', { level })}>
          {levelWide.map((material) => (
            <MaterialRow key={material.id} material={material} />
          ))}
        </Section>
      ) : null}

      {loaded.items.length === 0 ? <EmptyState icon="syllabus" title={t('profile.noSyllabus')} /> : null}
      {loaded.items.map((item) => {
        const lessons = loaded.materials.filter((m) => m.itemId === item.id);
        return (
          <View key={item.id} style={styles.item}>
            <ListRow
              leading={item.doneOn ? 'check' : 'syllabus'}
              highlighted={item.doneOn !== null}
              title={item.retired ? item.title : `${inUse.indexOf(item) + 1}. ${item.title}`}
              details={[
                ...(item.description ? [item.description] : []),
                item.doneOn ? t('progress.doneOn', { date: formatDate(item.doneOn) }) : t('progress.notYet'),
                ...(item.retired ? [t('progress.retired')] : []),
              ]}
            />
            {lessons.map((material) => (
              <MaterialRow key={material.id} material={material} />
            ))}
          </View>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  item: {
    gap: spacing.xs,
  },
});
