// One syllabus item as a card with a large tick box, for the syllabus tick-off screen (C9): its
// place in the teaching order, title and description, and once ticked, when and by whom, plus
// the remark. The screen puts its own controls (remark box, "untick?" question) inside as children.

import type { PropsWithChildren } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { cardLook, spacing, useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';
import { Icon } from './icon';

/** Props for SyllabusItemCard. */
export type SyllabusItemCardProps = PropsWithChildren<{
  /** Place in the level's teaching order, 1 first. */
  /** Place in the teaching order; 0 = no number (a retired item). */
  position: number;
  /** Item title and description, as the Guru wrote them in the syllabus. */
  title: string;
  description?: string | null;
  /** Ticked for this student. */
  done: boolean;
  /** Line under the title when ticked, already translated, e.g. "Ticked 29-09-2026 by Radha". */
  doneLine?: string;
  /** The remark line on the tick, if any, already translated, e.g. "Remark: needs a steadier tempo". */
  remark?: string | null;
  /** Called when the tick box is tapped, ticked or not. The screen decides what happens. */
  onToggle: () => void;
  /** Shows a spinner in the box and ignores taps while the change is being saved. */
  busy?: boolean;
}>;

/**
 * Card with a 44 px tick box on the left. Only the box is a button (a screen-reader checkbox), so
 * the controls a screen puts inside the card stay reachable on their own. A ticked card is drawn in
 * the "confirmed" green, so the ticked items stand out at a glance.
 */
export function SyllabusItemCard({
  position,
  title,
  description,
  done,
  doneLine,
  remark,
  onToggle,
  busy,
  children,
}: SyllabusItemCardProps) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.card,
        cardLook(colors),
        done ? { backgroundColor: colors.successSurface, borderColor: colors.success } : null,
      ]}>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="checkbox"
          // aria-* (not accessibilityState) so the web version reports them too.
          aria-checked={done}
          aria-busy={!!busy}
          accessibilityLabel={position ? `${position}. ${title}` : title}
          disabled={busy}
          hitSlop={spacing.xs}
          onPress={onToggle}
          style={[
            styles.box,
            {
              borderColor: done ? colors.success : colors.controlBorder,
              backgroundColor: done ? colors.success : colors.background,
            },
          ]}>
          {busy ? (
            <ActivityIndicator color={done ? colors.onPrimary : colors.primary} />
          ) : done ? (
            <Icon name="tick" size={28} color={colors.onPrimary} />
          ) : null}
        </Pressable>
        <View style={styles.text}>
          <AppText variant="label">{position ? `${position}. ${title}` : title}</AppText>
          {description ? (
            <AppText variant="small" tone="muted">
              {description}
            </AppText>
          ) : null}
          {done && doneLine ? (
            <AppText variant="small" tone="success">
              {doneLine}
            </AppText>
          ) : null}
          {done && remark ? <AppText variant="small">{remark}</AppText> : null}
        </View>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  box: {
    width: 44,
    height: 44,
    borderWidth: 2,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    gap: spacing.xs,
  },
});
