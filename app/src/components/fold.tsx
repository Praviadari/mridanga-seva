// A block of optional fields folded under one line (UI audit fix 6, docs/DECISIONS.md #366): a card-like row with the
// block's title and a down arrow opens it in place, so a long form shows first only what is needed. A standard
// disclosure button (role button, aria-expanded) for every user. Open, it looks like a Section (marigold top line).
// The open state belongs to the form, so the form can open the block itself, e.g. when Save finds a problem inside it.

import type { PropsWithChildren } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { cardLook, spacing, useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';
import { Icon, IconBadge, type IconName } from './icon';
import { MoreText } from './more-text';

/** Props for Fold. */
export type FoldProps = PropsWithChildren<{
  /** The block's title, already translated, e.g. "More about the student (optional)". */
  title: string;
  /** One line under the title while open, as on a Section. */
  description?: string;
  /** Icon in a circle before the title, as on a Section. */
  icon?: IconName;
  open: boolean;
  onToggle: (open: boolean) => void;
}>;

/** A title row that opens and closes the fields under it. */
export function Fold({ title, description, icon, open, onToggle, children }: FoldProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, cardLook(colors), open && { borderTopWidth: 3, borderTopColor: colors.accent }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        aria-expanded={open}
        onPress={() => onToggle(!open)}
        style={({ pressed }) => [styles.head, pressed && styles.pressed]}>
        {icon ? <IconBadge name={icon} size={36} /> : null}
        <AppText variant="subtitle" style={styles.title}>
          {title}
        </AppText>
        <View style={open ? styles.turned : null}>
          <Icon name="expand" size={20} color={colors.textMuted} />
        </View>
      </Pressable>
      {open && description ? <MoreText text={description} /> : null}
      {open ? children : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.md,
    gap: spacing.md,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
  },
  title: {
    flex: 1,
  },
  turned: {
    transform: [{ rotate: '180deg' }],
  },
  pressed: {
    opacity: 0.7,
  },
});
