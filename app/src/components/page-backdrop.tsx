// Dark mode's night sky behind every page (Praveen 15-10-2026, docs/DECISIONS.md #371): a soft gradient from a lighter
// navy at the top, through the page colour, to the deepest night at the foot. It fills the page frame (Screen) and stays
// put while the content scrolls over it. Light mode stays the flat cream, so nothing is drawn there. Drawn with
// react-native-svg like the home band (saffron-band.tsx), so no gradient package (native code) is needed.
// Decoration only: screen readers skip it, and it never takes a tap.

import { useId, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { useTheme } from '@/theme/use-theme';

/** Where the page colour itself sits between the top and the foot (the mockup Praveen picked). */
const MIDDLE = 0.45;

/** The page gradient in dark mode; nothing in light mode. Put it first inside a full page, behind the content. */
export function PageBackdrop() {
  const { colors, isDark } = useTheme();
  // SVG gradient ids are global on a web page; useId keeps two pages from sharing one.
  const gradientId = `page-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  // Sized in pixels once measured, as the home band is: an SVG sized "100%" kept an earlier layout's size on an iQOO Z7
  // (saffron-band.tsx). Until then the page's own colour, the gradient's middle, shows.
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((old) => (old && old.width === width && old.height === height ? old : { width, height }));
  };
  if (!isDark) return null;
  return (
    <View
      onLayout={onLayout}
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      aria-hidden
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden>
      {size ? (
        <Svg width={size.width} height={size.height}>
          <Defs>
            <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.bodyTop} />
              <Stop offset={MIDDLE} stopColor={colors.background} />
              <Stop offset="1" stopColor={colors.bodyBottom} />
            </LinearGradient>
          </Defs>
          <Rect width={size.width} height={size.height} fill={`url(#${gradientId})`} />
        </Svg>
      ) : null}
    </View>
  );
}
