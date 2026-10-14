// The saffron band drawn edge to edge at the top of the home screens (HomeHeader) and the
// sign-in screens (BrandHeader): a soft gradient from the header colours, running under the
// phone's status bar, with its content kept clear of the notch and to the page's column width.
// The gradient is drawn with react-native-svg, which the installed app already has, so no
// gradient package (native code) is needed (docs/DECISIONS.md #36).

import { StatusBar } from 'expo-status-bar';
import { useId, useState, type PropsWithChildren } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import { maxDashboardWidth, spacing, useTheme } from '@/theme/use-theme';

/** Props for SaffronBand. */
export type SaffronBandProps = PropsWithChildren<{
  /** Widest the content inside gets, in pixels. Default: the dashboard width. */
  maxWidth?: number;
  /** Centre the content (sign-in screens) instead of starting it on the left (home screens). */
  centred?: boolean;
}>;

/** Full-width saffron gradient band with its content in a centred column. */
export function SaffronBand({ maxWidth = maxDashboardWidth, centred, children }: SaffronBandProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  // SVG gradient ids are global on a web page; useId keeps two bands from sharing one.
  const gradientId = `band-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  // The band's measured size. An SVG sized "100%" kept the size of an earlier layout on an iQOO Z7
  // (Android, 10-10-2026: the gradient stopped short on the right and above the role line), so the
  // SVG gets the band's real size in pixels, and the band's own colour shows until it is measured.
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((old) => (old && old.width === width && old.height === height ? old : { width, height }));
  };

  return (
    <View
      onLayout={onLayout}
      style={[styles.band, { paddingTop: insets.top + spacing.lg, backgroundColor: colors.headerBottom }]}>
      {/* Light status-bar icons on saffron, while the band is on screen. */}
      <StatusBar style="light" />
      {/* Sized in pixels: on the web an SVG without width/height is drawn 300 x 150 px. */}
      <Svg
        style={StyleSheet.absoluteFill}
        width={size?.width ?? '100%'}
        height={size?.height ?? '100%'}
        aria-hidden>
        <Defs>
          <LinearGradient id={gradientId} x1="0" y1="0" x2="0.4" y2="1">
            {/* Deep night at the top, opening to royal blue below, like the dawn sky (#352). */}
            <Stop offset="0" stopColor={colors.headerBottom} />
            <Stop offset="1" stopColor={colors.headerTop} />
          </LinearGradient>
        </Defs>
        <Rect width={size?.width ?? '100%'} height={size?.height ?? '100%'} fill={`url(#${gradientId})`} />
        {size ? (
          <WebsiteGlow
            id={gradientId}
            width={size.width}
            height={size.height}
            gold={colors.headerGold}
            violet={colors.headerGlow}
            edge={colors.background}
          />
        ) : null}
      </Svg>
      <View style={[styles.column, { maxWidth }, centred && styles.centred]}>{children}</View>
    </View>
  );
}

/**
 * The website's night band (website/src/styles.css .night, #352): a golden halo behind the app's name, a faint
 * violet glow on the left, and a soft wave where the band meets the page.
 */
function WebsiteGlow({
  id,
  width,
  height,
  gold,
  violet,
  edge,
}: {
  id: string;
  width: number;
  height: number;
  gold: string;
  violet: string;
  edge: string;
}) {
  const wave = Math.min(14, height / 8);
  const d =
    `M0 ${height} L0 ${height - wave * 0.4} ` +
    `C ${width * 0.22} ${height - wave * 1.2}, ${width * 0.45} ${height + wave * 0.2}, ${width * 0.7} ${height - wave * 0.7} ` +
    `S ${width * 0.95} ${height - wave * 0.6}, ${width} ${height - wave * 0.9} L${width} ${height} Z`;
  return (
    <>
      <Defs>
        <RadialGradient id={`${id}-gold`} cx="0.5" cy="0.1" r="0.6">
          <Stop offset="0" stopColor={gold} stopOpacity={0.24} />
          <Stop offset="1" stopColor={gold} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id={`${id}-violet`} cx="0.08" cy="0.2" r="0.5">
          <Stop offset="0" stopColor={violet} stopOpacity={0.16} />
          <Stop offset="1" stopColor={violet} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect width={width} height={height} fill={`url(#${id}-gold)`} />
      <Rect width={width} height={height} fill={`url(#${id}-violet)`} />
      <Path d={d} fill={edge} />
    </>
  );
}
const styles = StyleSheet.create({
  band: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
    overflow: 'hidden',
  },
  column: {
    width: '100%',
    gap: spacing.sm,
  },
  centred: {
    alignItems: 'center',
  },
});
