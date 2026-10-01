// What a screen shows while its data loads: grey card shapes in roughly the place the real cards
// will take, gently fading in and out, instead of the word "Loading…". The page keeps its shape,
// so nothing jumps when the data arrives. Screen readers hear "Loading…" once.

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, StyleSheet, View } from 'react-native';

import { cardLook, radius, spacing, useTheme } from '@/theme/use-theme';

/** Props for LoadingCards. */
export type LoadingCardsProps = {
  /**
   * 'list' = rows like a list of students or announcements (default); 'tiles' = four number
   * tiles and a card, like a home screen.
   */
  kind?: 'list' | 'tiles';
  /** How many rows a 'list' shows. Default 3. */
  rows?: number;
};

/** Placeholder cards for a loading screen. */
export function LoadingCards({ kind = 'list', rows = 3 }: LoadingCardsProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  // One animated value for the life of the component (useState keeps it, no ref read in render).
  const [fade] = useState(() => new Animated.Value(1));

  useEffect(() => {
    // One slow fade for all shapes; the JS driver because the web has no native driver.
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(fade, { toValue: 0.45, duration: 700, useNativeDriver: false }),
        Animated.timing(fade, { toValue: 1, duration: 700, useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [fade]);

  const bar = (width: `${number}%`, height = 12) => (
    <View style={[styles.bar, { width, height, backgroundColor: colors.skeleton }]} />
  );

  return (
    <Animated.View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t('common.loading')}
      style={[styles.column, { opacity: fade }]}>
      {kind === 'tiles' ? (
        <>
          <View style={styles.grid}>
            {[0, 1, 2, 3].map((n) => (
              <View key={n} style={[styles.tile, cardLook(colors)]}>
                <View style={[styles.circle, { backgroundColor: colors.skeleton }]} />
                {bar('40%', 24)}
                {bar('80%')}
              </View>
            ))}
          </View>
          <View style={[styles.card, cardLook(colors)]}>
            {bar('50%', 18)}
            {bar('90%')}
            {bar('70%')}
          </View>
        </>
      ) : (
        Array.from({ length: rows }, (_, n) => (
          <View key={n} style={[styles.row, cardLook(colors)]}>
            <View style={[styles.circle, { backgroundColor: colors.skeleton }]} />
            <View style={styles.rowText}>
              {bar('60%', 14)}
              {bar('85%')}
            </View>
          </View>
        ))
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  column: {
    gap: spacing.md,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tile: {
    flexBasis: '45%',
    flexGrow: 1,
    padding: spacing.md,
    gap: spacing.sm,
  },
  card: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  rowText: {
    flex: 1,
    gap: spacing.sm,
  },
  circle: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  bar: {
    borderRadius: radius / 2,
  },
});
