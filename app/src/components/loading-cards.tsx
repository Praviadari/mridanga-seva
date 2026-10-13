// What a screen shows while its data loads: grey card shapes in roughly the place the real cards
// will take, gently fading in and out, instead of the word "Loading…". The page keeps its shape,
// so nothing jumps when the data arrives. Screen readers hear "Loading…" once.

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, Platform, StyleSheet, View } from 'react-native';

import { useReducedMotion } from '@/lib/reduced-motion';
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
  // "Remove animations" on the phone (or reduced motion in the browser): the shapes stand still (audit P2-09).
  const still = useReducedMotion();

  useEffect(() => {
    if (still) {
      fade.setValue(1);
      return;
    }
    // One slow fade for all shapes. On the phone the native driver runs it, so it stays smooth while the
    // JavaScript thread reads the data it waits for (audit P4-03 / P5-08, docs/DECISIONS.md #331); the web
    // has no native driver.
    const useNativeDriver = Platform.OS !== 'web';
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(fade, { toValue: 0.45, duration: 700, useNativeDriver }),
        Animated.timing(fade, { toValue: 1, duration: 700, useNativeDriver }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [fade, still]);

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
