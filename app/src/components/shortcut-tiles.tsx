// The student home's secondary cards under Today's Practice (docs/DECISIONS.md #674; Sarvesh Prji's student spec,
// section 2): two to a row, one to a row when the phone's text is large, each a coloured circle (module tones, #368)
// with its name and, when something waits, a count said in its accessible name ("Assessments, 2 to do"). A wide
// tile across the row for the one shortcut that must stand out (Śloka Study).

import { Pressable, StyleSheet, View } from 'react-native';

import type { ModuleTone } from '@/theme/colors';
import { cardLook, spacing, useLargeText, useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';
import { Icon, IconBadge, type IconName } from './icon';

/** One shortcut. */
export type Shortcut = {
  key: string;
  icon: IconName;
  tone: ModuleTone;
  label: string;
  /** A line under the name, already translated. */
  detail?: string;
  /** Something waiting: shown as a count, and `badgeSpoken` added to the name for screen readers. */
  badge?: number;
  badgeSpoken?: string;
  onPress: () => void;
};

/** Props for ShortcutTiles. */
export type ShortcutTilesProps = { shortcuts: readonly Shortcut[]; wide?: boolean };

/** The tiles; `wide`: each across the whole row. */
export function ShortcutTiles({ shortcuts, wide }: ShortcutTilesProps) {
  const { colors } = useTheme();
  const large = useLargeText();
  const full = wide || large;
  return (
    <View style={styles.grid}>
      {shortcuts.map((s) => {
        const waiting = (s.badge ?? 0) > 0;
        return (
          <Pressable
            key={s.key}
            accessibilityRole="button"
            accessibilityLabel={[s.label, s.detail, waiting ? s.badgeSpoken : null].filter(Boolean).join(', ')}
            onPress={s.onPress}
            style={({ pressed }) => [styles.tile, cardLook(colors), full ? styles.full : styles.half, pressed && styles.pressed]}>
            <IconBadge name={s.icon} tone={s.tone} solid size={full ? 44 : 40} />
            <View style={styles.words}>
              <AppText variant="label" numberOfLines={2}>
                {s.label}
              </AppText>
              {s.detail ? (
                <AppText variant="small" tone="muted" numberOfLines={2}>
                  {s.detail}
                </AppText>
              ) : null}
            </View>
            {waiting ? (
              <View style={[styles.badge, { backgroundColor: colors.danger }]}>
                <AppText variant="small" maxFontSizeMultiplier={1.3} style={[styles.count, { color: colors.onHeader }]}>
                  {(s.badge ?? 0) > 99 ? '99+' : String(s.badge)}
                </AppText>
              </View>
            ) : full ? (
              <Icon name="chevron" size={20} color={colors.textMuted} />
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tile: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
  },
  half: {
    flexBasis: '47%',
    flexGrow: 1,
  },
  full: {
    flexBasis: '100%',
  },
  words: {
    flex: 1,
    gap: 2,
  },
  badge: {
    minWidth: 24,
    minHeight: 24,
    borderRadius: 12,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  count: {
    fontWeight: '700',
    lineHeight: 16,
  },
  pressed: {
    opacity: 0.7,
  },
});
