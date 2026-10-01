// The saffron band drawn edge to edge at the top of the home screens (HomeHeader) and the
// sign-in screens (BrandHeader): a soft gradient from the header colours, running under the
// phone's status bar, with its content kept clear of the notch and to the page's column width.
// The gradient is drawn with react-native-svg, which the installed app already has, so no
// gradient package (native code) is needed (docs/DECISIONS.md #36).

import { StatusBar } from 'expo-status-bar';
import { useId, type PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

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

  return (
    <View style={[styles.band, { paddingTop: insets.top + spacing.lg }]}>
      {/* Light status-bar icons on saffron, while the band is on screen. */}
      <StatusBar style="light" />
      {/* width/height in percent: on the web an SVG without them is drawn 300 x 150 px. */}
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" aria-hidden>
        <Defs>
          <LinearGradient id={gradientId} x1="0" y1="0" x2="0.4" y2="1">
            <Stop offset="0" stopColor={colors.headerTop} />
            <Stop offset="1" stopColor={colors.headerBottom} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${gradientId})`} />
      </Svg>
      <View style={[styles.column, { maxWidth }, centred && styles.centred]}>{children}</View>
    </View>
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
