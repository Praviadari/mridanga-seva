// The app's own mark: the khol of the app icon, simplified (docs/DECISIONS.md #806; the icon is Prji's chosen khol,
// assets/images/source/): the drum lying on its side, wide bass head on the left, small treble head on the right, two
// stripes and the band by the big head, tilted a little so it rests on a round cushion with its piping. Two colours,
// so it sits on any band: the drum and cushion in `color`, the lines between them in `accent`. Used in the headers,
// the My QR pass and the welcome card. Drawn with react-native-svg, which the installed app already has, so a change
// reaches phones as an update. The ISKCON logo needs the temple's written permission (Praveen, 1 Oct 2026; #36).

import Svg, { Ellipse, G, Path } from 'react-native-svg';

/** Props for MridangaMark. */
export type MridangaMarkProps = {
  /** Width and height in pixels. */
  size: number;
  /** Colour of the drum and the cushion. */
  color: string;
  /** Colour of the stripes, the heads' rims and the cushion's piping; normally the colour behind the mark. */
  accent: string;
};

/** The drum mark. Decoration: screen readers skip it (the app name or greeting is next to it). */
export function MridangaMark({ size, color, accent }: MridangaMarkProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <G transform="translate(0 -6)">
        {/* The cushion: a curved front, its top seen a little from above, the piping along the hem. */}
        <Path d="M8 46 C6 48 6 54 9 56 Q32 62 55 56 C58 54 58 48 56 46 Z" fill={color} />
        <Ellipse cx={32} cy={46} rx={24} ry={3.5} fill={color} stroke={accent} strokeWidth={1.6} />
        <Path d="M10 54.5 Q32 60 54 54.5" stroke={accent} strokeWidth={1.4} strokeLinecap="round" fill="none" />
        {/* The drum, tilted so its narrow end rests on the cushion too. */}
        <G transform="translate(0 -1) rotate(7 10 44)">
          <Path d="M10 20 C24 15 41 18 54 26 L54 36 C41 44 24 47 10 44 Z" fill={color} stroke={accent} strokeWidth={1.6} />
          <Path
            d="M10 26.5 C24 22.5 41 24 54 29 M10 37.5 C24 40 41 38 54 33 M17 18.6 C19.4 25 19.4 39 17 45.4"
            stroke={accent}
            strokeWidth={1.8}
            strokeLinecap="round"
            fill="none"
          />
          {/* Bass head (left, wide) and treble head (right, small), each with its black centre. */}
          <Ellipse cx={10} cy={32} rx={4} ry={12} fill={color} stroke={accent} strokeWidth={1.8} />
          <Ellipse cx={9.6} cy={32} rx={1.6} ry={4.5} fill={accent} />
          <Ellipse cx={54} cy={31} rx={2.2} ry={5} fill={color} stroke={accent} strokeWidth={1.6} />
        </G>
      </G>
    </Svg>
  );
}
