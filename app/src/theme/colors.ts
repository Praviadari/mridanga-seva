// Colour palette for the whole app, in a light and a dark version.
// Screens never use raw colour codes; they take colours from useTheme() (src/theme/use-theme.ts),
// so a change here restyles every screen.

/**
 * Saffron brand colour. Also used by the splash screen and icons (app.json and
 * scripts/make-placeholder-icons.mjs), so change it in all three places together.
 */
export const brand = '#B45309';

/** Names of the colours every screen may use. */
export type Palette = {
  /** Screen background. */
  background: string;
  /** Cards, text fields and other raised surfaces. */
  surface: string;
  /** Main text. */
  text: string;
  /** Less important text: hints, captions. */
  textMuted: string;
  /** Lines around fields and cards. */
  border: string;
  /** Main buttons and links. */
  primary: string;
  /** Text and icons drawn on top of `primary`. */
  onPrimary: string;
  /** Errors and destructive actions. */
  danger: string;
  /** Light background behind an error message. */
  dangerSurface: string;
  /** Confirmation messages. */
  success: string;
  /** Light background behind a confirmation message. */
  successSurface: string;
};

// Contrast was checked against WCAG AA (4.5:1 for normal text) for text on background and
// surface, and for onPrimary on primary, in both schemes.
export const lightPalette: Palette = {
  background: '#FFF8F1',
  surface: '#FFFFFF',
  text: '#1F1A17',
  textMuted: '#645A52',
  border: '#E3D6C9',
  primary: brand,
  onPrimary: '#FFFFFF',
  danger: '#B42318',
  dangerSurface: '#FEF3F2',
  success: '#067647',
  successSurface: '#ECFDF3',
};

/**
 * Colours of a QR code, the same in light and dark mode. Scanners look for dark squares on a
 * light background; many cannot read a code drawn light on dark, so the code never follows the
 * dark theme.
 */
export const qrColours = {
  dark: '#000000',
  light: '#FFFFFF',
} as const;

export const darkPalette: Palette = {
  background: '#16120F',
  surface: '#221C18',
  text: '#F5EFE9',
  textMuted: '#B8ADA3',
  border: '#3F352E',
  primary: '#F59E0B',
  onPrimary: '#1F1A17',
  danger: '#F97066',
  dangerSurface: '#3A1A17',
  success: '#47CD89',
  successSurface: '#10291C',
};
