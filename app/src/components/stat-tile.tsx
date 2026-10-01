// A big number with a short label under it, for the home screens (S1, C1, G1), e.g. "12" over
// "Here now", with an icon above. A tile that leads to the screen with the details is a button
// and shows an arrow. StatGrid lays tiles out two to a row on a phone, four on a wide screen.

import type { PropsWithChildren } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { cardLook, spacing, useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';
import { Icon, IconBadge, type IconName } from './icon';

/** Props for StatTile. */
export type StatTileProps = {
  /** The number (or a short value such as "—"), already formatted. */
  value: string;
  /** What the number counts, already translated, e.g. "Visits today". */
  label: string;
  /** Icon at the top of the tile. */
  icon: IconName;
  /** Opens the screen with the details. Without it the tile is plain text. */
  onPress?: () => void;
};

/** One number on a home screen; a button when `onPress` is given. */
export function StatTile({ value, label, icon, onPress }: StatTileProps) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  // Two per row on a phone (a little under half each; the gap fills the rest), four from 720 px.
  const basis = { flexBasis: width >= WIDE_FROM ? '23%' : '45%' } as const;
  const content = (
    <>
      <View style={styles.top}>
        <IconBadge name={icon} size={36} />
        {/* The arrow says "this opens something" without reading the label. */}
        {onPress ? <Icon name="chevron" size={18} color={colors.textMuted} /> : null}
      </View>
      <AppText variant="number">{value}</AppText>
      <AppText variant="small" tone="muted">
        {label}
      </AppText>
    </>
  );
  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        // Screen readers hear "12, Here now" as one button.
        accessibilityLabel={`${value}, ${label}`}
        onPress={onPress}
        style={({ pressed }) => [styles.tile, basis, cardLook(colors), pressed && styles.pressed]}>
        {content}
      </Pressable>
    );
  }
  return (
    <View accessible accessibilityLabel={`${value}, ${label}`} style={[styles.tile, basis, cardLook(colors)]}>
      {content}
    </View>
  );
}

/** Window width in pixels from which tiles sit four to a row. */
const WIDE_FROM = 720;

/**
 * Lays StatTiles out in rows that wrap: two per row on a phone, four on a wide screen, so the
 * tiles fit without scrolling sideways.
 */
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
    flexGrow: 1,
    padding: spacing.md,
    gap: spacing.xs,
  },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.xs,
  },
  pressed: {
    opacity: 0.7,
  },
});
