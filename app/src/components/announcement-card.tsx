// One announcement in a list (C15 for staff, S10 for students): an icon (a pin when pinned), the
// title with a "New" badge, the start of the message, and a few short lines such as who it is for
// and when. Tapping it opens the whole announcement.

import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { cardLook, radius, spacing, useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';
import { Icon, IconBadge } from './icon';

/** Props for AnnouncementCard. */
export type AnnouncementCardProps = {
  title: string;
  /** The message; the card shows its first few lines. */
  body: string;
  /** Pinned announcements get a pin, a "Pinned" badge and a saffron edge, so they stand out at the top. */
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
        cardLook(colors),
        pinned && { borderColor: colors.primary, borderWidth: 2 },
        pressed && styles.pressed,
      ]}>
      <IconBadge name={pinned ? 'pin' : 'news'} size={36} />
      <View style={styles.text}>
        <View style={styles.titleRow}>
          <AppText variant="label" style={styles.title}>
            {title}
          </AppText>
          {badges.map((badge) => (
            <View key={badge} style={[styles.badge, { backgroundColor: colors.primary }]}>
              <AppText variant="small" style={{ color: colors.onPrimary }}>
                {badge}
              </AppText>
            </View>
          ))}
        </View>
        <AppText numberOfLines={3}>{body}</AppText>
        {details.map((line) => (
          <AppText key={line} variant="small" tone="muted">
            {line}
          </AppText>
        ))}
      </View>
      <Icon name="chevron" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    // Narrow gaps leave the text most of a 375 px phone.
    gap: spacing.sm,
    padding: spacing.md,
  },
  text: {
    flex: 1,
    gap: spacing.xs,
  },
  titleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    flexShrink: 1,
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
