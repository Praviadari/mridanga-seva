// The app's button: a filled main action, an outlined second action, or a text link, with an
// optional icon before the label. Since #323 (audit F5-16): when onPress returns a promise (an async
// save passed straight in), the button shows its spinner and ignores presses until it settles.

import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { cardRadius, radius, spacing, typography, useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';
import { Icon, type IconName } from './icon';

/** Props for Button. */
export type ButtonProps = {
  /** Text on the button, already translated. */
  label: string;
  /** What a press does; a returned promise keeps the button busy until it settles (#323). */
  onPress: () => unknown;
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
  /** Icon before the label, e.g. the QR shape on "My QR card". */
  icon?: IconName;
  /**
   * What screen readers say instead of the label, when the label alone does not tell which one,
   * e.g. "Check in, Arjun Rao" for one of many "Check in" buttons. Default the label.
   */
  accessibilityLabel?: string;
};

/**
 * A pressable button at least 48 px tall, the minimum touch size recommended for phones.
 * While `loading` it shows a spinner instead of the label and ignores presses, so a slow
 * network cannot cause a double submit.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'normal',
  loading,
  disabled,
  icon,
  accessibilityLabel,
}: ButtonProps) {
  const { colors } = useTheme();
  // A press while the last one's promise runs is ignored (a ref: two quick taps come before a re-render).
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const inactive = disabled || loading || busy;
  const press = () => {
    if (running.current) return;
    const result = onPress();
    if (result && typeof (result as Promise<unknown>).then === 'function') {
      running.current = true;
      setBusy(true);
      void (result as Promise<unknown>).finally(() => {
        running.current = false;
        setBusy(false);
      });
    }
  };
  const textColour = variant === 'primary' ? colors.onPrimary : colors.primary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      // aria-* props (not accessibilityState) so the web version reports them too.
      aria-disabled={!!inactive}
      aria-busy={!!loading || busy}
      disabled={inactive}
      onPress={press}
      style={({ pressed }) => [
        styles.base,
        variant === 'primary' && { backgroundColor: colors.primary },
        variant === 'secondary' && { borderColor: colors.primary, borderWidth: 1.5 },
        variant === 'link' && styles.link,
        size === 'large' && styles.large,
        (pressed || disabled) && styles.dimmed,
      ]}>
      {loading || busy ? (
        <ActivityIndicator color={textColour} />
      ) : (
        <>
          {icon ? <Icon name={icon} size={size === 'large' ? 28 : 20} color={textColour} /> : null}
          <AppText
            style={[styles.label, size === 'large' ? typography.subtitle : typography.label, { color: textColour }]}>
            {label}
          </AppText>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    borderRadius: radius,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: {
    // A long Telugu label wraps inside the button instead of pushing the icon out.
    flexShrink: 1,
    textAlign: 'center',
  },
  link: {
    paddingHorizontal: spacing.sm,
    alignSelf: 'center',
  },
  large: {
    minHeight: 72,
    borderRadius: cardRadius,
  },
  dimmed: {
    opacity: 0.6,
  },
});
