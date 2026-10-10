// The drawn art of the simple homes (10-10-2026, docs/DECISIONS.md #241): a soft lotus mandala
// behind the ring of modules, and a temple outline between lotuses behind the fact card under it. The volunteers' mockup (#39) had a
// painted banner of a temple and a drum; a picture of a temple or deities is the temple's call and
// costs a few hundred KB per update, so this is drawn from a few shapes in the app's own colours
// instead, with react-native-svg (already in the app; no native change). Decoration only: screen
// readers skip it, and it never takes a tap.

import { useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { useTheme } from '@/theme/use-theme';

/** Petals of the mandala's outer and inner rings. */
const OUTER_PETALS = 16;
const INNER_PETALS = 8;

/** A lotus mandala of `size` pixels, drawn faintly in the primary colour behind the ring. */
export function RingMandala({ size }: { size: number }) {
  const { colors, isDark } = useTheme();
  const strength = isDark ? 0.22 : 0.16;
  const petal = (length: number, width: number) =>
    // One petal pointing up from the centre (100, 100), length and width in viewBox units.
    `M100 100 C ${100 - width} ${100 - length * 0.45}, ${100 - width * 0.4} ${100 - length * 0.9}, 100 ${100 - length} ` +
    `C ${100 + width * 0.4} ${100 - length * 0.9}, ${100 + width} ${100 - length * 0.45}, 100 100 Z`;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.centre]} aria-hidden importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <Svg width={size} height={size} viewBox="0 0 200 200">
        <G opacity={strength}>
          {Array.from({ length: OUTER_PETALS }, (_, i) => (
            <Path
              key={`o${i}`}
              d={petal(92, 14)}
              transform={`rotate(${(360 / OUTER_PETALS) * i + 360 / OUTER_PETALS / 2} 100 100)`}
              fill="none"
              stroke={colors.primary}
              strokeWidth={0.9}
            />
          ))}
          {Array.from({ length: INNER_PETALS }, (_, i) => (
            <Path key={`i${i}`} d={petal(70, 18)} transform={`rotate(${(360 / INNER_PETALS) * i} 100 100)`} fill={colors.primary} opacity={0.35} />
          ))}
          <Circle cx={100} cy={100} r={96} fill="none" stroke={colors.primary} strokeWidth={0.8} strokeDasharray="1.5 3" />
          <Circle cx={100} cy={100} r={74} fill="none" stroke={colors.primary} strokeWidth={0.6} />
        </G>
      </Svg>
    </View>
  );
}

/**
 * A temple outline between lotuses, faint, filling its parent from the bottom: the background of
 * the fact card under the ring (components/fact-card.tsx; Praveen 10-10-2026: the temple blends in
 * behind the fact instead of a band of its own, so it shows without scrolling).
 */
export function TempleBackdrop() {
  const { colors, isDark } = useTheme();
  // SVG gradient ids are global on a web page; useId keeps two bands from sharing one.
  const fadeId = `fade-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const ink = colors.primary;
  // Faint enough for the fact's text to read over it.
  const strength = isDark ? 0.12 : 0.08;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} aria-hidden importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <Svg width="100%" height="100%" viewBox="0 0 400 132" preserveAspectRatio="xMidYMax meet">
        <Defs>
          <LinearGradient id={fadeId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={ink} stopOpacity={0} />
            <Stop offset="1" stopColor={ink} stopOpacity={0.5} />
          </LinearGradient>
        </Defs>
        {/* A soft glow rising from the bottom edge. */}
        <Rect x={0} y={40} width={400} height={92} fill={`url(#${fadeId})`} opacity={strength} />
        <G opacity={strength + 0.08} fill={ink}>
          {/* Temple: platform, walls with three arches, a tall middle dome and two side domes. */}
          <Rect x={128} y={118} width={144} height={6} rx={1} />
          <Path d="M140 118 V88 H260 V118 H244 V102 a8 8 0 0 0 -16 0 V118 H208 V100 a8 9 0 0 0 -16 0 V118 H172 V102 a8 8 0 0 0 -16 0 V118 Z" />
          <Path d="M174 88 C 176 60, 192 46, 200 30 C 208 46, 224 60, 226 88 Z" />
          <Path d="M144 88 C 146 74, 154 68, 158 60 C 162 68, 170 74, 172 88 Z" />
          <Path d="M228 88 C 230 74, 238 68, 242 60 C 246 68, 254 74, 256 88 Z" />
          {/* Kalaśa tops and the flag on the middle dome. */}
          <Circle cx={200} cy={27} r={3} />
          <Circle cx={158} cy={57} r={2} />
          <Circle cx={242} cy={57} r={2} />
          <Rect x={199.3} y={8} width={1.4} height={17} />
          <Path d="M200.7 8 L214 12.5 L200.7 17 Z" />
          {/* Ground line. */}
          <Rect x={0} y={124} width={400} height={1.5} opacity={0.6} />
          {/* Lotuses: two on each side. */}
          <Lotus x={52} y={124} scale={1} />
          <Lotus x={96} y={124} scale={0.7} />
          <Lotus x={304} y={124} scale={0.7} />
          <Lotus x={348} y={124} scale={1} />
        </G>
      </Svg>
    </View>
  );
}

/** One lotus standing on the ground line at (x, y). */
function Lotus({ x, y, scale }: { x: number; y: number; scale: number }) {
  return (
    <G transform={`translate(${x} ${y}) scale(${scale})`}>
      <Path d="M0 0 C -6 -10, -6 -22, 0 -30 C 6 -22, 6 -10, 0 0 Z" />
      <Path d="M0 0 C -10 -6, -18 -16, -20 -24 C -10 -22, -3 -14, 0 0 Z" opacity={0.8} />
      <Path d="M0 0 C 10 -6, 18 -16, 20 -24 C 10 -22, 3 -14, 0 0 Z" opacity={0.8} />
      <Path d="M0 0 C -14 -2, -26 -8, -30 -14 C -18 -14, -8 -8, 0 0 Z" opacity={0.6} />
      <Path d="M0 0 C 14 -2, 26 -8, 30 -14 C 18 -14, 8 -8, 0 0 Z" opacity={0.6} />
    </G>
  );
}

const styles = StyleSheet.create({
  centre: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
