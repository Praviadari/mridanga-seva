// The app's button: a filled main action, an outlined second action, or a text link.

import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { radius, spacing, typography, useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';

/** Props for Button. */
export type ButtonProps = {
  /** Text on the button, already translated. */
  label: string;
  onPress: () => void;
  /** 'primary' = main action (one per screen), 'secondary' = outlined, 'link' = text only. */
  variant?: 'primary' | 'secondary' | 'link';
  /**
   * 'large' is taller with bigger text, for the one thing a screen is mostly for, e.g. My QR on
   * the student home, which a student opens while standing at the door. Default 'normal'.
   */
  size?: 'normal' | 'large';
  /** Shows a spinner and ignores presses, e.g. while waiting for the server. */
  loading?: boolean;
  disabled?: boolean;
};

/**
 * A pressable button at least 48 px tall, the minimum touch size recommended for phones.
 * While `loading` it shows a spinner instead of the label and ignores presses, so a slow
 * network cannot cause a double submit.
 */
export function Button({ label, onPress, variant = 'primary', size = 'normal', loading, disabled }: ButtonProps) {
  const { colors } = useTheme();
  const inactive = disabled || loading;
  const textColour = variant === 'primary' ? colors.onPrimary : colors.primary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      // aria-* props (not accessibilityState) so the web version reports them too.
      aria-disabled={!!inactive}
      aria-busy={!!loading}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        variant === 'primary' && { backgroundColor: colors.primary },
        variant === 'secondary' && { borderColor: colors.primary, borderWidth: 1.5 },
        variant === 'link' && styles.link,
        size === 'large' && styles.large,
        (pressed || disabled) && styles.dimmed,
      ]}>
      {loading ? (
        <ActivityIndicator color={textColour} />
      ) : (
        <AppText style={[size === 'large' ? typography.subtitle : typography.label, { color: textColour }]}>
          {label}
        </AppText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    borderRadius: radius,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  link: {
    paddingHorizontal: spacing.sm,
    alignSelf: 'center',
  },
  large: {
    minHeight: 72,
  },
  dimmed: {
    opacity: 0.6,
  },
});
