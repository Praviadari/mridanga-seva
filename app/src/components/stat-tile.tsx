// A big number with a short label under it, for the home screens (S1, C1, G1), e.g. "12" over
// "Here now". A tile that leads to the screen with the details is tappable. StatGrid lays tiles
// out two to a row on a phone.

import type { PropsWithChildren } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { radius, spacing, useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';

/** Props for StatTile. */
export type StatTileProps = {
  /** The number (or a short value such as "—"), already formatted. */
  value: string;
  /** What the number counts, already translated, e.g. "Visits today". */
  label: string;
  /** Opens the screen with the details. Without it the tile is plain text. */
  onPress?: () => void;
};

/** One number on a home screen; a button when `onPress` is given. */
export function StatTile({ value, label, onPress }: StatTileProps) {
  const { colors } = useTheme();
  const look = { backgroundColor: colors.surface, borderColor: onPress ? colors.primary : colors.border };
  const content = (
    <>
      <AppText variant="title" tone="primary">
        {value}
      </AppText>
      <AppText variant="small">{label}</AppText>
    </>
  );
  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        // Screen readers hear "12, Here now" as one button.
        accessibilityLabel={`${value}, ${label}`}
        onPress={onPress}
        style={({ pressed }) => [styles.tile, look, pressed && styles.pressed]}>
        {content}
      </Pressable>
    );
  }
  return (
    <View accessible accessibilityLabel={`${value}, ${label}`} style={[styles.tile, look]}>
      {content}
    </View>
  );
}

/** Lays StatTiles out in rows of two that wrap, so four tiles fit a phone without scrolling sideways. */
export function StatGrid({ children }: PropsWithChildren) {
  return <View style={styles.grid}>{children}</View>;
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tile: {
    // Two per row: each takes a little under half, and the gap fills the rest.
    flexBasis: '45%',
    flexGrow: 1,
    borderWidth: 1,
    borderRadius: radius,
    padding: spacing.md,
    gap: spacing.xs,
  },
  pressed: {
    opacity: 0.7,
  },
});
