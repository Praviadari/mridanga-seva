// My level and its syllabus as one slim bar, "7 of 20 in Beginner", and the next item to learn once the path is read
// (#620); a button to My Learning (S4). On the student home until #674, at the top of the Learn tab since.

import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet } from 'react-native';

import type { StudentHome } from '@/data/home';
import { levelName } from '@/i18n/labels';
import type { LevelPath } from '@/lib/level-path';

import { AppText } from './app-text';
import { ProgressBar } from './progress-bar';

/** The level strip. */
export function LevelStrip({ home, path }: { home: StudentHome; path: LevelPath | null }) {
  const { t } = useTranslation();
  const level = levelName(t, home.levelId);
  const text =
    home.syllabusTotal > 0
      ? t('home.student.levelStrip', { level, done: home.syllabusDone, total: home.syllabusTotal })
      : t('home.student.levelStripNone', { level });
  // The path of another level (moved up since it was read) says nothing here.
  const ownPath = path?.levelId === home.levelId ? path : null;
  const next = ownPath?.next[0];
  const nextText = next ? t('levelPath.next', { title: next.title }) : ownPath?.complete ? t('levelPath.complete', { level }) : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={nextText ? `${text}. ${nextText}` : text}
      onPress={() => router.push('/student/progress')}
      style={({ pressed }) => [styles.strip, pressed && styles.pressed]}>
      <ProgressBar done={home.syllabusDone} total={home.syllabusTotal} label={text} valueText={text} />
      {nextText ? (
        <AppText variant="small" numberOfLines={1}>
          {nextText}
        </AppText>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  strip: {
    minHeight: 48,
    justifyContent: 'center',
    gap: 2,
  },
  pressed: {
    opacity: 0.7,
  },
});
