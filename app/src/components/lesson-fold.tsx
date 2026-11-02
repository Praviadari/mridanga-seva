// One lesson of My Learning as a fold-open row (docs/DECISIONS.md #785; the team's "Study Material Navigation" draft,
// screen C): the lesson's title, "2 of 5 chapters done" and + / − on a row as tall as a thumb; open, its chapters
// under it. A lesson of one chapter has no chapters to show: its row opens the chapter at once (an arrow, not +).
// A standard disclosure button (role button, aria-expanded), like components/fold.tsx; the words carry the state,
// the colour only repeats it.

import type { PropsWithChildren } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { cardLook, spacing, useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';
import { Icon, IconBadge } from './icon';

/** Props for LessonFold. */
export type LessonFoldProps = PropsWithChildren<{
  /** The lesson's title, as the teachers wrote it. */
  title: string;
  /** Lines under the title, already translated, e.g. "2 of 5 chapters done". */
  details: string[];
  /** Every chapter ticked: the row shows a tick. */
  done: boolean;
  /** A lesson with chapters: open or not, and the toggle. */
  open?: boolean;
  onToggle?: () => void;
  /** A lesson of one chapter: the row opens it. */
  onOpen?: () => void;
}>;

/** A lesson row that folds its chapters open, or opens its only chapter. */
export function LessonFold({ title, details, done, open = false, onToggle, onOpen, children }: LessonFoldProps) {
  const { colors } = useTheme();
  const folds = onToggle !== undefined;
  return (
    <View style={[styles.card, cardLook(colors), open && { borderTopWidth: 3, borderTopColor: colors.accent }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={[title, ...details].join(', ')}
        aria-expanded={folds ? open : undefined}
        onPress={folds ? onToggle : onOpen}
        style={({ pressed }) => [styles.head, pressed && styles.pressed]}>
        <IconBadge name={done ? 'tick' : 'syllabus'} size={36} />
        <View style={styles.text}>
          <AppText variant="label">{title}</AppText>
          {details.map((line) => (
            <AppText key={line} variant="small" tone={done ? 'success' : 'muted'}>
              {line}
            </AppText>
          ))}
        </View>
        {folds ? (
          <View style={[styles.sign, { borderColor: colors.primary }]}>
            <AppText variant="subtitle" style={{ color: colors.primary }}>
              {open ? '−' : '+'}
            </AppText>
          </View>
        ) : (
          <Icon name="chevron" size={20} color={colors.textMuted} />
        )}
      </Pressable>
      {open ? <View style={styles.chapters}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.sm,
    gap: spacing.sm,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 56,
    paddingHorizontal: spacing.xs,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  sign: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chapters: {
    gap: spacing.xs,
  },
  pressed: {
    opacity: 0.7,
  },
});
