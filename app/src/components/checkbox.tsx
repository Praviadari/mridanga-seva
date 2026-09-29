// A tick box with a label that can run over several lines, e.g. a consent confirmation.

import { Pressable, StyleSheet, View } from 'react-native';

import { spacing, useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';

/** Props for Checkbox. */
export type CheckboxProps = {
  /** The statement being ticked, already translated. The whole row can be tapped. */
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Error under the box, already translated. */
  error?: string;
};

/** Tick box. Shows a ✓ in the brand colour when checked. */
export function Checkbox({ label, checked, onChange, error }: CheckboxProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.wrapper}>
      <Pressable
        accessibilityRole="checkbox"
        aria-checked={checked}
        accessibilityLabel={label}
        onPress={() => onChange(!checked)}
        style={styles.row}>
        <View
          style={[
            styles.box,
            {
              borderColor: error ? colors.danger : checked ? colors.primary : colors.border,
              backgroundColor: checked ? colors.primary : colors.surface,
            },
          ]}>
          {checked ? (
            <AppText variant="label" style={{ color: colors.onPrimary }}>
              ✓
            </AppText>
          ) : null}
        </View>
        <AppText style={styles.label}>{label}</AppText>
      </Pressable>
      {error ? (
        <AppText variant="small" tone="danger" role="alert">
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
    alignItems: 'flex-start',
    gap: spacing.md,
    minHeight: 44,
  },
  box: {
    width: 28,
    height: 28,
    borderWidth: 2,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  label: {
    flex: 1,
  },
});
