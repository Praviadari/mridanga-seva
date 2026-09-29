// One row in a list of people, e.g. a student in the attendance search or in "Who is here now":
// the name, a line or two of details, and optionally one button on the right. A row can also
// open something when tapped, e.g. the student's profile from the student list.

import { Pressable, StyleSheet, View } from 'react-native';

import { radius, spacing, useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';
import { Button, type ButtonProps } from './button';

/** Props for ListRow. */
export type ListRowProps = {
  /** Main line, e.g. the student's name. */
  title: string;
  /** Smaller lines under the title, already translated, e.g. roll number and level. */
  details?: string[];
  /**
   * Draws the row in the "confirmed" green, e.g. for a student who is checked in, so the state
   * can be seen at a glance without reading.
   */
  highlighted?: boolean;
  /** One button at the right end of the row. */
  action?: Pick<ButtonProps, 'label' | 'onPress' | 'loading' | 'disabled' | 'variant'>;
  /**
   * Called when the row itself is tapped. Makes the whole row one button for screen readers, so
   * do not combine it with `action`: on phones a screen reader cannot reach a button inside it.
   */
  onPress?: () => void;
};

/** A card-like row with a title, details and an optional button; tappable when `onPress` is given. */
export function ListRow({ title, details = [], highlighted, action, onPress }: ListRowProps) {
  const { colors } = useTheme();
  const look = {
    backgroundColor: highlighted ? colors.successSurface : colors.surface,
    borderColor: highlighted ? colors.success : colors.border,
  };
  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={[title, ...details].join(', ')}
        onPress={onPress}
        style={({ pressed }) => [styles.row, look, pressed && styles.pressed]}>
        <RowContent title={title} details={details} action={action} />
      </Pressable>
    );
  }
  return (
    <View style={[styles.row, look]}>
      <RowContent title={title} details={details} action={action} />
    </View>
  );
}

/** The inside of a row: the text column and the button. */
function RowContent({ title, details = [], action }: Pick<ListRowProps, 'title' | 'details' | 'action'>) {
  return (
    <>
      <View style={styles.text}>
        <AppText variant="label">{title}</AppText>
        {details.map((line) => (
          <AppText key={line} variant="small" tone="muted">
            {line}
          </AppText>
        ))}
      </View>
      {action ? <Button {...action} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius,
    padding: spacing.md,
  },
  text: {
    flex: 1,
    gap: spacing.xs,
  },
  pressed: {
    opacity: 0.7,
  },
});
