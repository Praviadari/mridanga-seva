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
  /** Pale saffron behind an icon or a badge; an icon on it uses `primary`. */
  primarySoft: string;
  /** Text on `primarySoft`, e.g. a person's initials: darker than `primary` for contrast. */
  onPrimarySoft: string;
  /** Edge of a card. Faint in light mode, where the shadow does the work; clearer in dark mode. */
  cardBorder: string;
  /** Shadow under cards, as a CSS colour. Dark mode uses none: shadows do not show on dark. */
  shadow: string;
  /** The grey shapes shown while a screen loads. */
  skeleton: string;
  /** Top and bottom colours of the saffron band at the top of the home screens and header bars. */
  headerTop: string;
  headerBottom: string;
  /** Text and icons on the saffron band. */
  onHeader: string;
  /** Less important text on the saffron band. */
  onHeaderMuted: string;
};

// Contrast was checked against WCAG AA (4.5:1 for normal text) for text on background and
// surface, onPrimary on primary, onPrimarySoft on primarySoft (icons on it need 3:1), and
// onHeader / onHeaderMuted on both header colours, in both schemes (1 Oct 2026, DECISIONS #36).
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
  primarySoft: '#FDEBD3',
  onPrimarySoft: '#8A3A0E',
  cardBorder: '#F1E6DA',
  shadow: 'rgba(120, 64, 20, 0.14)',
  skeleton: '#F1E6DA',
  // A deeper saffron than the brand colour, so the paler header text keeps 4.5:1.
  headerTop: '#9A4307',
  headerBottom: '#742C0B',
  onHeader: '#FFFFFF',
  onHeaderMuted: '#FDE7CF',
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
  primarySoft: '#3A2817',
  onPrimarySoft: '#F59E0B',
  cardBorder: '#3F352E',
  shadow: 'transparent',
  skeleton: '#2E2620',
  headerTop: '#5C2B0C',
  headerBottom: '#2E1609',
  onHeader: '#FFF3E6',
  onHeaderMuted: '#E8CDB3',
};
