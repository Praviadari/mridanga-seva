// The app's own mark: a mridanga (khol) drawn from a few curves, with a wide bass head on the
// left, a small treble head on the right and the lacing between them. Used in the header of the
// home screens. It stands in for a logo until the team has one; the ISKCON logo needs the
// temple's written permission (Praveen, 1 Oct 2026; docs/DECISIONS.md #36). Drawn with
// react-native-svg, which the installed app already has, so it reaches phones as an update.

import Svg, { Ellipse, Path } from 'react-native-svg';

/** Props for MridangaMark. */
export type MridangaMarkProps = {
  /** Width and height in pixels. */
  size: number;
  /** Colour of the drum's body. */
  color: string;
  /** Colour of the lacing and the drum heads; normally the colour behind the mark. */
  accent: string;
};

/** The drum mark. Decoration: screen readers skip it (the app name or greeting is next to it). */
export function MridangaMark({ size, color, accent }: MridangaMarkProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      {/* Body: widest a little left of the middle, like a khol. */}
      <Path d="M9 18 C 21 10, 41 11, 55 24 L 55 40 C 41 53, 21 54, 9 46 Z" fill={color} />
      {/* Lacing from head to head. */}
      <Path
        d="M9 25 C 23 20, 41 21, 55 29 M9 32 C 23 31, 41 31, 55 32 M9 39 C 23 44, 41 43, 55 35"
        stroke={accent}
        strokeWidth={2.4}
        strokeLinecap="round"
        fill="none"
      />
      {/* Bass head (left, wide) and treble head (right, small). */}
      <Ellipse cx={9} cy={32} rx={3.5} ry={14} fill={color} stroke={accent} strokeWidth={2} />
      <Ellipse cx={55} cy={32} rx={2.5} ry={8} fill={color} stroke={accent} strokeWidth={2} />
    </Svg>
  );
}
