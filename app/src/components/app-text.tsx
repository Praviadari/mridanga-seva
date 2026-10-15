// Text in the app's sizes and colours. Use it instead of React Native's <Text> so every screen
// follows src/theme and switches with light/dark mode.

import { Text, type TextProps } from 'react-native';

import { isLatinSerif, useHeadingFont } from '@/theme/fonts';
import { serifType } from '@/theme/tokens.generated';
import { typography, useTheme } from '@/theme/use-theme';

/** Props for AppText: every <Text> prop, plus a size and a colour. */
export type AppTextProps = TextProps & {
  /** Size and weight, from `typography`. Default 'body'. */
  variant?: keyof typeof typography;
  /** Colour role. Default 'default' (main text colour). */
  tone?: 'default' | 'muted' | 'primary' | 'danger' | 'success';
  /**
   * 'sans' keeps a title or subtitle in the plain font: person names, titles staff typed, numbers and bols
   * (the serif is for the app's own headings, docs/DECISIONS.md #337, #367). Default: serif for titles and
   * subtitles once the language's heading font is loaded.
   */
  family?: 'serif' | 'sans';
};

/**
 * Themed text. Titles get the 'header' accessibility role so screen readers can jump to them; on
 * the web a title is a level-1 heading and a subtitle level 2 (without a level every heading
 * became an h1). Numbers use the 'number' variant, not a heading.
 */
export function AppText({ variant = 'body', tone = 'default', family, style, ...rest }: AppTextProps) {
  const { colors } = useTheme();
  const serif = useHeadingFont();
  const colour = {
    default: colors.text,
    muted: colors.textMuted,
    primary: colors.primary,
    danger: colors.danger,
    success: colors.success,
  }[tone];
  const heading = variant === 'title' || variant === 'subtitle';
  // One family per weight: with a custom font Android must not also get a fontWeight. The English serif is set larger;
  // the Telugu and Hindi serifs keep the sans sizes (#367).
  const face =
    heading && serif && family !== 'sans'
      ? { ...(isLatinSerif(serif) ? serifType[variant] : null), fontFamily: serif, fontWeight: 'normal' as const }
      : null;
  return (
    <Text
      accessibilityRole={heading ? 'header' : undefined}
      aria-level={variant === 'title' ? 1 : variant === 'subtitle' ? 2 : undefined}
      style={[typography[variant], face, { color: colour }, style]}
      {...rest}
    />
  );
}
