// One row in a list of people, e.g. a student in the attendance search or in "Who is here now":
// the name, a line or two of details, and optionally one button on the right.

import { StyleSheet, View } from 'react-native';

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
};

/** A card-like row with a title, details and an optional button. */
export function ListRow({ title, details = [], highlighted, action }: ListRowProps) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.row,
        {
          backgroundColor: highlighted ? colors.successSurface : colors.surface,
          borderColor: highlighted ? colors.success : colors.border,
        },
      ]}>
      <View style={styles.text}>
        <AppText variant="label">{title}</AppText>
        {details.map((line) => (
          <AppText key={line} variant="small" tone="muted">
            {line}
          </AppText>
        ))}
      </View>
      {action ? <Button {...action} /> : null}
    </View>
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
});
