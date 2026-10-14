// A titled card that groups related things: fields in a long form ("Student", "Parent or
// guardian") or a block of a home screen ("This week", "Announcements"), optionally with an icon
// before the heading. Since the launch UI (#355) it wears the website's card top: a thin marigold line.

import type { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';

import { cardLook, spacing, useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';
import { IconBadge, type IconName } from './icon';
import { MoreText } from './more-text';

/** Props for Section. */
export type SectionProps = PropsWithChildren<{
  /** Heading, already translated. */
  title: string;
  /** One line under the heading explaining the section, already translated. */
  description?: string;
  /** Icon in a saffron circle before the heading, for the blocks of a home screen. */
  icon?: IconName;
}>;

/** Card with a heading and the content inside it. */
export function Section({ title, description, icon, children }: SectionProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, cardLook(colors), { borderTopWidth: 3, borderTopColor: colors.accent }]}>
      <View style={styles.heading}>
        {icon ? <IconBadge name={icon} size={36} /> : null}
        <View style={styles.headingText}>
          <AppText variant="subtitle">{title}</AppText>
          {/* One line; the rest behind "ⓘ More" (UI audit 14-10-2026, #363). */}
          {description ? <MoreText text={description} /> : null}
        </View>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.md,
    gap: spacing.md,
  },
  heading: {
    flexDirection: 'row',
    // The icon stays beside the heading when a long description wraps under it.
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  headingText: {
    flex: 1,
  },
});
