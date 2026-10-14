// Gives a screen the colours, spacing and text sizes for the phone's light or dark setting.
// Use it in every component instead of raw numbers or colour codes.

import { createElement } from 'react';
import { useColorScheme, useWindowDimensions, View } from 'react-native';

import { isDarkFor } from '@/lib/appearance';

import { useAppearance } from './appearance';
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
  // 14 px since the launch UI (#355; audit phase 5: 13 px was hard to read in sunlight).
  small: { fontSize: 14, lineHeight: 20, fontWeight: '400' },
  /** The big number on a home-screen tile. */
  number: { fontSize: 28, lineHeight: 36, fontWeight: '700' },
} as const;

/** Corner roundness for fields and buttons. */
export const radius = 10;

/** Corner roundness for cards and tiles: rounder than fields, so a card reads as one block (the website's 14 px, #355). */
export const cardRadius = 14;

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
 * Returns the palette for light or dark: the choice on My profile, else the phone's (or browser's) setting.
 * Re-renders the caller when the user changes that setting.
 */
export function useTheme(): Theme {
  // The person's choice on My profile (#361), or the phone's own setting under "Same as phone".
  const isDark = isDarkFor(useAppearance(), useColorScheme());
  return { colors: isDark ? darkPalette : lightPalette, isDark };
}

/**
 * Header bar of the screens opened from a home (title and back button): the website's night bar (royal in dark mode)
 * with the title in gold and a thin gold line under it, like the home band (#362). For a Stack's `screenOptions`.
 */
export function headerBarOptions(colors: Palette, titleFont?: string) {
  return {
    ...barOptions(colors, titleFont),
    contentStyle: { backgroundColor: colors.background },
  } as const;
}

/**
 * Tabs of a role (staff/(tabs), student/(tabs)): the same header bar as above, and a tab bar in the surface
 * colour; the open tab has a filled icon in a pill and a bold label (components/icon.tsx tabIcon, #338). `sidebar` puts the tabs on the left
 * with the label beside the icon, for wide screens. Tabs are at least 56 px tall (48 px minimum).
 * `fontScale` is the phone's text size setting (1 = normal): the bottom bar grows with it, so a
 * label at 200 % is not cut off under the icon. From about 115 % a label may take two lines
 * (components/tab-label.tsx, audit P3-03, docs/DECISIONS.md #315), so the bar has room for the second line.
 */
export function tabsScreenOptions(colors: Palette, sidebar: boolean, fontScale = 1, titleFont?: string) {
  const secondLine = fontScale >= 1.15 ? Math.round(18 * fontScale) : 0;
  const extra = Math.round(Math.max(0, fontScale - 1) * 24) + secondLine;
  return {
    ...barOptions(colors, titleFont),
    sceneStyle: { backgroundColor: colors.background },
    tabBarActiveTintColor: colors.tabActive,
    tabBarInactiveTintColor: colors.tabInactive,
    // The open tab's pill in the sidebar.
    tabBarActiveBackgroundColor: sidebar ? colors.tabActiveIndicator : undefined,
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
 * A header bar's title: the website's serif (theme/fonts.tsx useHeadingFont, English only) a little larger, as on the
 * home band (#355); the phone's bold sans otherwise.
 */
function headerTitle(colors: Palette, titleFont: string | undefined) {
  return titleFont
    ? ({ color: colors.headerGold, fontFamily: titleFont, fontSize: 22, fontWeight: 'normal' } as const)
    : ({ color: colors.headerGold } as const);
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
    // The website's two-layer shadow (website/src/tokens.css --shadow, #355).
    boxShadow: `0 1px 2px ${colors.shadow}, 0 8px 24px ${colors.shadow}`,
  } as const;
}

/** The bar itself, shared by stacks and tabs: night (royal in dark mode), a thin gold line under it, light arrows. */
function barOptions(colors: Palette, titleFont: string | undefined) {
  return {
    headerStyle: { backgroundColor: colors.bar },
    headerBackground: () =>
      createElement(View, { style: { flex: 1, backgroundColor: colors.bar, borderBottomWidth: 1, borderBottomColor: colors.barLine } }),
    headerTintColor: colors.onHeader,
    headerTitleStyle: headerTitle(colors, titleFont),
  };
}