// One announcement in a list (C15 for staff, S10 for students): a "Pinned" and a "New" badge,
// the title, the start of the message, and a few short lines such as who it is for and when.
// Tapping it opens the whole announcement.

import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { radius, spacing, useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';

/** Props for AnnouncementCard. */
export type AnnouncementCardProps = {
  title: string;
  /** The message; the card shows its first few lines. */
  body: string;
  /** Pinned announcements get a badge and a coloured border, so they stand out at the top. */
  pinned: boolean;
  /** Shows a "New" badge: the person has not opened it yet. */
  unread: boolean;
  /** Short lines under the message, already translated, e.g. "All students", "Seen by 3 of 12". */
  details: string[];
  onPress: () => void;
};

/** A tappable card for one announcement. */
export function AnnouncementCard({ title, body, pinned, unread, details, onPress }: AnnouncementCardProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const badges = [pinned ? t('announcements.pinned') : null, unread ? t('announcements.unread') : null].filter(
    (badge): badge is string => badge !== null,
  );
  return (
    <Pressable
      accessibilityRole="button"
      // Screen readers hear the badges and the title first, then the lines; the full text is
      // on the announcement's own screen.
      accessibilityLabel={[...badges, title, ...details].join(', ')}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: pinned ? colors.primary : colors.border,
          borderWidth: pinned ? 2 : 1,
        },
        pressed && styles.pressed,
      ]}>
      {badges.length > 0 ? (
        <View style={styles.badges}>
          {badges.map((badge) => (
            <View key={badge} style={[styles.badge, { backgroundColor: colors.primary }]}>
              <AppText variant="small" style={{ color: colors.onPrimary }}>
                {badge}
              </AppText>
            </View>
          ))}
        </View>
      ) : null}
      <AppText variant="label">{title}</AppText>
      <AppText numberOfLines={3}>{body}</AppText>
      {details.map((line) => (
        <AppText key={line} variant="small" tone="muted">
          {line}
        </AppText>
      ))}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius,
    padding: spacing.md,
    gap: spacing.xs,
  },
  badges: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  badge: {
    borderRadius: radius,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  pressed: {
    opacity: 0.7,
  },
});
