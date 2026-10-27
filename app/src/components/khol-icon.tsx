// The Practice icon (docs/DECISIONS.md #671; Sarvesh Prji's student spec 27-10-2026, section 2): the Śrī Khol, the
// two-headed clay drum of kirtan, in a monoline outline drawn like the Ionicons outlines of the icon font (24-unit
// box, 1.5 stroke, round ends): the wide bass head on the left, the small treble head on the right, the body swelling
// between them and two leather straps from head to head. Never a Western drum or an emoji. The open tab's version
// fills the body with a light tint of the same colour, so it differs by shape and not only by colour (#338); the
// dark version is the same drawing in the dark theme's colour. Drawn with react-native-svg (already in the installed
// app), so it reaches phones as an update and the icon font stays as it is.

import Svg, { Ellipse, Path } from 'react-native-svg';

/** The body's outline, from the bass head over the top to the treble head and back underneath. */
const BODY = 'M4 6.75C8.5 4.2 14.5 4.6 20.5 8.9V15.1C14.5 19.4 8.5 19.8 4 17.25Z';
/** The top and bottom of the body only (the heads draw the ends). */
const SIDES = 'M4 6.75C8.5 4.2 14.5 4.6 20.5 8.9M4 17.25C8.5 19.8 14.5 19.4 20.5 15.1';
/** Two straps from head to head, following the body. */
const STRAPS = 'M6 9.5C10 8 15 8.4 19.4 10.4M6 14.5C10 16 15 15.6 19.4 13.6';

/** Props for KholIcon. */
export type KholIconProps = {
  /** Width and height in pixels. */
  size: number;
  color: string;
  /** The open tab's version: the body tinted (#338). */
  filled?: boolean;
  /** Said by screen readers when the icon stands alone; left out it is decoration (the word next to it says it). */
  label?: string;
};

/** The Śrī Khol. */
export function KholIcon({ size, color, filled, label }: KholIconProps) {
  const a11y = label ? { accessible: true, accessibilityRole: 'image' as const, accessibilityLabel: label } : { 'aria-hidden': true };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" {...a11y}>
      {filled ? <Path d={BODY} fill={color} fillOpacity={0.3} /> : null}
      <Path d={SIDES} stroke={color} strokeWidth={1.5} strokeLinecap="round" fill="none" />
      <Path d={STRAPS} stroke={color} strokeWidth={1.25} strokeLinecap="round" fill="none" />
      {/* Bass head (left, wide) and treble head (right, small). */}
      <Ellipse cx={4} cy={12} rx={1.75} ry={5.25} stroke={color} strokeWidth={1.5} fill={filled ? color : 'none'} />
      <Ellipse cx={20.5} cy={12} rx={1.1} ry={3.1} stroke={color} strokeWidth={1.5} fill={filled ? color : 'none'} />
    </Svg>
  );
}
