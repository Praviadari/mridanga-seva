// A tick box with a label that can run over several lines, e.g. a consent confirmation.

import { Pressable, StyleSheet, View } from 'react-native';

import { spaceKeyProps } from '@/lib/space-key';
import { spacing, useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';
import { Icon } from './icon';

/** Props for Checkbox. */
export type CheckboxProps = {
  /** The statement being ticked, already translated. The whole row can be tapped. */
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Error under the box, already translated. */
  error?: string;
};

/**
 * Tick box. Shows a tick in the brand colour when checked: an icon of fixed size, so a large text
 * size cannot push it out of the box. Space ticks it on the web too.
 */
export function Checkbox({ label, checked, onChange, error }: CheckboxProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.wrapper}>
      <Pressable
        accessibilityRole="checkbox"
        aria-checked={checked}
        accessibilityLabel={label}
        onPress={() => onChange(!checked)}
        {...spaceKeyProps(() => onChange(!checked))}
        style={styles.row}>
        <View
          style={[
            styles.box,
            {
              borderColor: error ? colors.danger : checked ? colors.primary : colors.controlBorder,
              backgroundColor: checked ? colors.primary : colors.surface,
            },
          ]}>
          {checked ? <Icon name="tick" size={20} color={colors.onPrimary} /> : null}
        </View>
        <AppText style={styles.label}>{label}</AppText>
      </Pressable>
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
    alignItems: 'flex-start',
    gap: spacing.md,
    // 48 dp: Android's smallest comfortable touch target.
    minHeight: 48,
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
