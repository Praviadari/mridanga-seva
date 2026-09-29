// Draws a QR code, for the student's My QR card (S3). The pattern is worked out on the phone by
// qrcode-generator (plain JavaScript, so no internet is needed) and drawn with react-native-svg
// as one shape, so it stays sharp at any size and draws quickly on Android, iPhone and the web
// (docs/DECISIONS.md #21).

import createQrCode from 'qrcode-generator';
import { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { qrColours } from '@/theme/colors';

/**
 * Empty border round the code, in modules (the code's small squares). The QR standard asks for
 * four; scanners use it to find where the code starts.
 */
const QUIET_ZONE = 4;

/**
 * Text made only of these characters can use the QR "alphanumeric" mode, which packs it into a
 * smaller code with bigger squares, easier to scan from a phone screen.
 */
const ALPHANUMERIC = /^[0-9A-Z $%*+\-./:]*$/;

/** Props for QrCode. */
export type QrCodeProps = {
  /** The text to put in the code. */
  value: string;
  /**
   * Largest width and height, in pixels, including the white border. The drawn code can be a
   * few pixels smaller, so that every square is a whole number of pixels.
   */
  size: number;
  /** What a screen reader says for the code, already translated. */
  label: string;
};

/**
 * A QR code with its white border, always black on white (see qrColours). Error correction is
 * level Q, which can rebuild about a quarter of the code when glare or a cracked screen hides
 * part of it. For a student's code (40 capitals, digits and signs) it gives the same 29 x 29
 * squares as the more usual level M.
 */
export function QrCode({ value, size, label }: QrCodeProps) {
  const { path, modules } = useMemo(() => qrShape(value), [value]);
  const box = modules + QUIET_ZONE * 2;
  // Whole pixels per square: squares drawn across pixel edges blur, and faint lines can appear
  // between rows, which some scanners trip over.
  const drawn = Math.max(1, Math.floor(size / box)) * box;

  return (
    <View role="img" aria-label={label} style={{ width: drawn, height: drawn }}>
      <Svg width={drawn} height={drawn} viewBox={`0 0 ${box} ${box}`}>
        <Rect width={box} height={box} fill={qrColours.light} />
        <Path d={path} fill={qrColours.dark} />
      </Svg>
    </View>
  );
}

/**
 * Works out the code's pattern and turns it into one SVG path. Squares that sit next to each other
 * in a row are joined into one rectangle, which keeps the path short.
 * @returns path in module units, already shifted by the quiet zone; modules = squares per side.
 */
function qrShape(value: string): { path: string; modules: number } {
  // Type number 0 lets the library pick the smallest code that holds the text.
  const code = createQrCode(0, 'Q');
  code.addData(value, ALPHANUMERIC.test(value) ? 'Alphanumeric' : 'Byte');
  code.make();

  const modules = code.getModuleCount();
  const parts: string[] = [];
  for (let row = 0; row < modules; row++) {
    let col = 0;
    while (col < modules) {
      if (!code.isDark(row, col)) {
        col++;
        continue;
      }
      const start = col;
      while (col < modules && code.isDark(row, col)) col++;
      const run = col - start;
      parts.push(`M${start + QUIET_ZONE} ${row + QUIET_ZONE}h${run}v1h-${run}z`);
    }
  }
  return { path: parts.join(''), modules };
}
