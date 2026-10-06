// A row of buttons where exactly one can be chosen, e.g. level, relation, language.
// Easier to tap than a drop-down on a phone, and every choice stays visible. As `chips`, the
// choices are rounded pills with an icon each, e.g. who an announcement is for (round 4).

import { Pressable, StyleSheet, View } from 'react-native';

import { radius, spacing, useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';
import { Icon, type IconName } from './icon';

/** One choice: the value stored, the label shown (already translated) and, for chips, an icon. */
export type Choice<T> = { value: T; label: string; icon?: IconName };

/** Props for ChoiceGroup. */
export type ChoiceGroupProps<T> = {
  /** Label above the buttons, already translated. Also read out by screen readers. */
  label?: string;
  choices: readonly Choice<T>[];
  /** The chosen value, or null for none yet. */
  value: T | null;
  onChange: (value: T) => void;
  /** Error under the buttons, already translated. */
  error?: string;
  /** Rounded pills with the choice's icon before the label, instead of plain buttons. */
  chips?: boolean;
};

/** Single-choice buttons that wrap onto more lines when there are many. */
export function ChoiceGroup<T extends string | number>({
  label,
  choices,
  value,
  onChange,
  error,
  chips,
}: ChoiceGroupProps<T>) {
  const { colors } = useTheme();
  return (
    <View style={styles.wrapper}>
      {label ? <AppText variant="label">{label}</AppText> : null}
      <View role="radiogroup" accessibilityLabel={label} style={styles.row}>
        {choices.map((choice) => {
          const selected = choice.value === value;
          const textColour = selected ? colors.onPrimary : colors.text;
          return (
            <Pressable
              key={String(choice.value)}
              accessibilityRole="radio"
              // aria-checked (not accessibilityState) so the web version reports it too.
              aria-checked={selected}
              accessibilityLabel={choice.label}
              onPress={() => onChange(choice.value)}
              style={[
                styles.option,
                chips && styles.chip,
                {
                  borderColor: selected ? colors.primary : error ? colors.danger : colors.controlBorder,
                  backgroundColor: selected ? colors.primary : colors.surface,
                },
              ]}>
              {chips && choice.icon ? (
                <Icon name={choice.icon} size={18} color={selected ? colors.onPrimary : colors.primary} />
              ) : null}
              <AppText variant="label" style={{ color: textColour }}>
                {choice.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
      {error ? (
        <AppText variant="small" tone="danger" role="alert" accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  option: {
    minHeight: 44,
    minWidth: 88,
    paddingHorizontal: spacing.md,
    borderWidth: 1.5,
    borderRadius: radius,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  chip: {
    minWidth: 0,
    borderRadius: 999,
  },
});
