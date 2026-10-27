// The Learn tab, "My Learning" (docs/DECISIONS.md #670, #675; Sarvesh Prji's student spec, section 1): My Level with
// the level path (#620), then the syllabus with its lessons (My Learning, S4), assessments with how many wait (S7),
// milestones reached (lib/milestones.ts, shown on Practice History) and Learn more (the Guru's links). A tab of the
// first web download, so it holds only rows; each opens its screen from the student area (#650). It loads again each
// time it comes into view.

import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { LevelStrip } from '@/components/level-strip';
import { ListRow } from '@/components/list-row';
import { Screen } from '@/components/screen';
import { fetchMyOpenAssessmentCount, fetchStudentHome, type StudentHome } from '@/data/home';
import { fetchMyPath } from '@/data/level-path';
import { LEVEL_IDS, levelName } from '@/i18n/labels';
import { todayLocal } from '@/lib/dates';
import { useLatestLoad } from '@/lib/latest-load';
import { levelPath, type LevelPath } from '@/lib/level-path';
import { milestones, type Milestone } from '@/lib/milestones';
import { cardLook, spacing, useTheme } from '@/theme/use-theme';

/** The Learn tab. */
export default function StudentLearnTab() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { profile } = useAuth();
  const myId = profile?.id ?? '';
  const [home, setHome] = useState<StudentHome | 'not_found' | null>(null);
  const [path, setPath] = useState<LevelPath | null>(null);
  const [reached, setReached] = useState<Milestone[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const beginLoad = useLatestLoad();

  const load = useCallback(async () => {
    const isNewest = beginLoad();
    const [loadedHome, loadedOpen, loadedPath] = await Promise.all([
      fetchStudentHome({ weekStarts: false }),
      fetchMyOpenAssessmentCount(),
      myId ? fetchMyPath(myId) : Promise.resolve(null),
    ]);
    if (!isNewest()) return;
    setHome(loadedHome);
    setOpen(loadedOpen);
    if (loadedPath) {
      setPath(levelPath(loadedPath.items, loadedPath.levelId, LEVEL_IDS));
      setReached(loadedPath.practice ? milestones(loadedPath.practice.days, loadedPath.practice.goal, todayLocal()) : null);
    }
  }, [myId, beginLoad]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const mine = home && home !== 'not_found' ? home : null;
  const done = reached?.filter((m) => m.reachedOn).length ?? 0;
  return (
    <Screen underHeader onRefresh={load}>
      {mine ? (
        <View style={[styles.card, cardLook(colors), { borderTopWidth: 3, borderTopColor: colors.accent }]}>
          <AppText variant="label" tone="muted">
            {t('learnTab.level')}
          </AppText>
          <AppText variant="subtitle">{levelName(t, mine.levelId)}</AppText>
          <LevelStrip home={mine} path={path} />
        </View>
      ) : null}
      <ListRow
        leading="syllabus"
        title={t('learnTab.syllabus')}
        details={[t('learnTab.syllabusDetail')]}
        onPress={() => router.push('/student/progress')}
      />
      <ListRow
        leading="assessment"
        title={t('assessments.title')}
        details={open === null ? [] : [open > 0 ? t('learnTab.assessmentsOpen', { count: open }) : t('learnTab.assessmentsNone')]}
        highlight={open ? 'attention' : undefined}
        onPress={() => router.push('/student/assessments')}
      />
      <ListRow
        leading="promote"
        title={t('learnTab.milestones')}
        details={reached ? [t('learnTab.milestonesDetail', { reached: done, total: reached.length })] : []}
        onPress={() => router.push('/student/practice-log')}
      />
      <ListRow leading="library" title={t('learnMore.title')} onPress={() => router.push('/student/learn-more')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.md,
    gap: spacing.xs,
  },
});
