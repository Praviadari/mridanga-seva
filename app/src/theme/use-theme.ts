// Gives a screen the colours, spacing and text sizes for the phone's light or dark setting.
// Use it in every component instead of raw numbers or colour codes.

import { useColorScheme } from 'react-native';

import { darkPalette, lightPalette, type Palette } from './colors';

/** Space between things, in density-independent pixels. Use these steps, not other numbers. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

/**
 * Text sizes in pixels. Telugu and Devanagari letters are taller than Latin ones, so line
 * heights are generous (about 1.5x) to keep vowel signs from being clipped.
 */
export const typography = {
  title: { fontSize: 26, lineHeight: 38, fontWeight: '700' },
  subtitle: { fontSize: 19, lineHeight: 28, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' },
  label: { fontSize: 15, lineHeight: 22, fontWeight: '600' },
  small: { fontSize: 13, lineHeight: 20, fontWeight: '400' },
} as const;

/** Corner roundness for fields, buttons and cards. */
export const radius = 10;

/**
 * Widest a form or reading column should get, in pixels. Keeps lines readable on tablets and on
 * the web version on a computer.
 */
export const maxContentWidth = 480;

/** Everything a component needs to style itself. */
export type Theme = {
  colors: Palette;
  isDark: boolean;
};

/**
 * Returns the palette matching the phone's (or browser's) light/dark setting.
 * Re-renders the caller when the user changes that setting.
 */
export function useTheme(): Theme {
  const isDark = useColorScheme() === 'dark';
  return { colors: isDark ? darkPalette : lightPalette, isDark };
}
