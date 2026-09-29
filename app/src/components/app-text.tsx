// Text in the app's sizes and colours. Use it instead of React Native's <Text> so every screen
// follows src/theme and switches with light/dark mode.

import { Text, type TextProps } from 'react-native';

import { typography, useTheme } from '@/theme/use-theme';

/** Props for AppText: every <Text> prop, plus a size and a colour. */
export type AppTextProps = TextProps & {
  /** Size and weight, from `typography`. Default 'body'. */
  variant?: keyof typeof typography;
  /** Colour role. Default 'default' (main text colour). */
  tone?: 'default' | 'muted' | 'primary' | 'danger' | 'success';
};

/** Themed text. Titles get the 'header' accessibility role so screen readers can jump to them. */
export function AppText({ variant = 'body', tone = 'default', style, ...rest }: AppTextProps) {
  const { colors } = useTheme();
  const colour = {
    default: colors.text,
    muted: colors.textMuted,
    primary: colors.primary,
    danger: colors.danger,
    success: colors.success,
  }[tone];
  return (
    <Text
      accessibilityRole={variant === 'title' || variant === 'subtitle' ? 'header' : undefined}
      style={[typography[variant], { color: colour }, style]}
      {...rest}
    />
  );
}
