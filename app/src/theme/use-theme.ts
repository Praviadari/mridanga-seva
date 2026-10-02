// Gives a screen the colours, spacing and text sizes for the phone's light or dark setting.
// Use it in every component instead of raw numbers or colour codes.

import { useColorScheme, useWindowDimensions } from 'react-native';

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
  /** The big number on a home-screen tile. */
  number: { fontSize: 28, lineHeight: 36, fontWeight: '700' },
} as const;

/** Corner roundness for fields and buttons. */
export const radius = 10;

/** Corner roundness for cards and tiles: rounder than fields, so a card reads as one block. */
export const cardRadius = 16;

/**
 * Widest a form or reading column should get, in pixels. Keeps lines readable on tablets and on
 * the web version on a computer.
 */
export const maxContentWidth = 480;

/**
 * Widest a home screen (S1, C1, G1) gets. Its tiles sit four to a row from about 720 px, so a
 * laptop shows a dashboard instead of one narrow column in an empty page.
 */
export const maxDashboardWidth = 960;

/**
 * Window width in pixels from which a screen is "wide": home tiles sit four to a row and lists
 * go two columns (a laptop, a tablet held sideways).
 */
export const wideFrom = 720;

/** True on a wide window (see `wideFrom`). Re-renders when the window is resized or turned. */
export function useWide(): boolean {
  return useWindowDimensions().width >= wideFrom;
}

/**
 * True when the person has made the text larger in their phone's settings (about 130 % or more).
 * Layouts that put several words side by side (a ring of circles, two columns of details) then
 * fall back to one column, so nothing is cut off at 200 %.
 */
export function useLargeText(): boolean {
  return useWindowDimensions().fontScale >= 1.3;
}

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

/**
 * Header bar of the screens opened from a home (title and back button): saffron like the home
 * header, with light text. For a Stack's `screenOptions`.
 */
export function headerBarOptions(colors: Palette) {
  return {
    headerStyle: { backgroundColor: colors.headerTop },
    headerTintColor: colors.onHeader,
    headerTitleStyle: { color: colors.onHeader },
    contentStyle: { backgroundColor: colors.background },
  } as const;
}

/**
 * Tabs of a role (staff/(tabs), student/(tabs)): the same saffron header bar as above, and a tab
 * bar in the surface colour with the open tab in saffron. `sidebar` puts the tabs on the left
 * with the label beside the icon, for wide screens. Tabs are at least 56 px tall (48 px minimum).
 * `fontScale` is the phone's text size setting (1 = normal): the bottom bar grows with it, so a
 * label at 200 % is not cut off under the icon.
 */
export function tabsScreenOptions(colors: Palette, sidebar: boolean, fontScale = 1) {
  const extra = Math.round(Math.max(0, fontScale - 1) * 24);
  return {
    headerStyle: { backgroundColor: colors.headerTop },
    headerTintColor: colors.onHeader,
    headerTitleStyle: { color: colors.onHeader },
    sceneStyle: { backgroundColor: colors.background },
    tabBarActiveTintColor: colors.primary,
    tabBarInactiveTintColor: colors.textMuted,
    // The open tab's pill in the sidebar.
    tabBarActiveBackgroundColor: sidebar ? colors.primarySoft : undefined,
    tabBarStyle: {
      backgroundColor: colors.surface,
      borderColor: colors.cardBorder,
      ...(sidebar ? { width: 232, paddingTop: spacing.md } : { minHeight: 60 + extra }),
    },
    tabBarItemStyle: sidebar
      ? ({ minHeight: 52, justifyContent: 'flex-start', paddingHorizontal: spacing.md } as const)
      : { minHeight: 56 + extra },
    // Telugu and Hindi letters need the taller line (see `typography`).
    tabBarLabelStyle: sidebar
      ? ({ fontSize: 15, lineHeight: 22, fontWeight: '600' } as const)
      : ({ fontSize: 12, lineHeight: 18, fontWeight: '600' } as const),
    tabBarPosition: sidebar ? 'left' : 'bottom',
    tabBarLabelPosition: sidebar ? 'beside-icon' : 'below-icon',
  } as const;
}

/**
 * The look of a card: surface colour, edge and a soft shadow (light mode only). `boxShadow` works
 * the same on Android, iPhone and the web with the New Architecture (React Native 0.76 and later).
 */
export function cardLook(colors: Palette) {
  return {
    backgroundColor: colors.surface,
    borderColor: colors.cardBorder,
    borderWidth: 1,
    borderRadius: cardRadius,
    boxShadow: `0 1px 3px ${colors.shadow}`,
  } as const;
}
