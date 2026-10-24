// The level path on My progress (S4; docs/DECISIONS.md #620): "7 of 20 in Beginner" with a calm bar, the next item or
// two to learn, and the level that comes after (moving up stays the facilitator's decision). The student home's strip
// shows the same count with the next item (app/student/(tabs)/index.tsx). Worked out in lib/level-path.ts.

import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { levelName } from '@/i18n/labels';
import type { LevelPath } from '@/lib/level-path';
import { spacing, useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';
import { Icon } from './icon';
import { ProgressBar } from './progress-bar';

/** Props for LevelPathView. */
export type LevelPathViewProps = {
  /** The path of a level with at least one item. */
  path: LevelPath;
};

/** The bar, the next items and the next level. */
export function LevelPathView({ path }: LevelPathViewProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const level = levelName(t, path.levelId);
  const count = t('home.student.levelStrip', { level, done: path.done, total: path.total });
  return (
    <View style={styles.wrapper}>
      <ProgressBar done={path.done} total={path.total} label={t('levelPath.label', { level })} valueText={count} />
      {path.next.length > 0 ? (
        <View style={styles.next}>
          <AppText variant="label">{t('levelPath.nextTitle')}</AppText>
          {path.next.map((item) => (
            <View key={item.id} style={styles.row}>
              <Icon name="syllabus" size={18} color={colors.primary} />
              <AppText style={styles.title}>{item.title}</AppText>
            </View>
          ))}
        </View>
      ) : null}
      {path.complete ? <AppText tone="success">{t('levelPath.complete', { level })}</AppText> : null}
      <AppText tone="muted">
        {path.nextLevelId === null
          ? t('levelPath.topLevel', { level })
          : t('levelPath.nextLevel', { level, next: levelName(t, path.nextLevelId) })}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: spacing.sm,
  },
  next: {
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    flexShrink: 1,
  },
});
