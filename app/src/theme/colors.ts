// Colour palette for the whole app, in a light and a dark version.
// Screens never use raw colour codes; they take colours from useTheme() (src/theme/use-theme.ts),
// so a change here restyles every screen. The values come from design/tokens.json through
// tokens.generated.ts (docs/DECISIONS.md #336): change a colour there, run node design/build-tokens.mjs,
// and the app's tests check every text colour for 4.5:1 in both schemes.

import { chips, modules, semantic } from './tokens.generated';

/**
 * Night of the native splash screen and the app icon (app.json and scripts/make-emblem-icons.mjs, docs/DECISIONS.md
 * #364): the JS splash uses the same colour, so the start looks like one screen. Changes with a new APK only.
 */
export const brand = '#1B1E4B';

/** Text and the spinner on `brand` (the splash), before the theme is known: the band's ivory. */
export const onBrand = '#FFF6E8';

/** Names of the colours every screen may use. */
export type Palette = {
  /** Screen background: the flat page colour, also the middle of dark mode's night gradient. */
  background: string;
  /**
   * Top and foot of the page gradient behind every screen in dark mode (components/page-backdrop.tsx, #371);
   * in light mode both equal `background`, a flat cream.
   */
  bodyTop: string;
  bodyBottom: string;
  /** Cards, text fields and other raised surfaces. */
  surface: string;
  /** Text fields, sheets and menus: a step above `surface`. */
  surfaceRaised: string;
  /** A quiet box sunk into the page (the end of a home, a skeleton). */
  surfaceSunken: string;
  /** Main text. */
  text: string;
  /** Less important text: hints, captions. */
  textMuted: string;
  /** Faint lines: table rules, file rows, the info notice. Too pale for a control's only edge. */
  border: string;
  /**
   * The edge of a control that has no other outline: text fields, unticked boxes, unselected
   * choices. 3:1 or more on background and surface (WCAG 1.4.11; DECISIONS #104).
   */
  controlBorder: string;
  /** Main buttons and links. */
  primary: string;
  /** A main button while it is pressed. */
  primaryPressed: string;
  /** Text and icons drawn on top of `primary`. */
  onPrimary: string;
  /** Text links. */
  link: string;
  /** Marigold: a mark on the header band, never text on a light page. */
  accent: string;
  /** Text on `accent`. */
  onAccent: string;
  /** Gold, decoration only. */
  ornament: string;
  /** The keyboard focus ring (web). */
  focus: string;
  /** Errors and destructive actions. */
  danger: string;
  /** Light background behind an error message. */
  dangerSurface: string;
  /** Confirmation messages: done, present, approved. */
  success: string;
  /** Light background behind a confirmation message. */
  successSurface: string;
  /** "Needs attention": something waits for someone to act (overdue, to approve; #338). */
  warning: string;
  /** Background of a "needs attention" row or notice. */
  warningSurface: string;
  /** Edge of a "needs attention" row or notice. */
  warningBorder: string;
  /** News and information (indigo). */
  info: string;
  infoSurface: string;
  infoBorder: string;
  /** A button or field that cannot be used now: text, and its background. */
  disabled: string;
  disabledSurface: string;
  /** The open tab: its icon and label, and the pill behind its icon (#338). */
  tabActive: string;
  tabActiveIndicator: string;
  /** The other tabs. */
  tabInactive: string;
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
  /** Behind a sheet or a full-screen card. */
  overlay: string;
  /** A row or tile while it is pressed. */
  pressedOverlay: string;
  /**
   * Top and bottom colours of the band at the top of the home screens and header bars: night indigo
   * (option A) or saffron, the team's choice in design/tokens.json.
   */
  headerTop: string;
  headerBottom: string;
  /** Text and icons on the band. */
  onHeader: string;
  /** Less important text on the band. */
  onHeaderMuted: string;
  /** The header bars of the inner screens: the website's night (royal in dark mode), and the thin gold line under them (#362). */
  bar: string;
  barLine: string;
  /** A marigold word on the band (indigo) or a pale one (saffron). */
  headerAccent: string;
  /** Gold lettering on the band and the header bars' titles, like the team's mockup (#352); the brighter gold since #373. */
  headerGold: string;
  /** A faint violet glow on the band, as on the website's night band (decoration only). */
  headerGlow: string;
  /**
   * Small status labels (components/status-chip.tsx): text and background per kind. `info` new,
   * `success` active, `warning` irregular, `neutral` inactive, `paused` paused, `danger` left.
   */
  chips: Record<ChipTone, { text: string; background: string }>;
  /**
   * A colour per module for the icon circles of the home screen (components/module-ring.tsx,
   * round 4): a pale tint behind the icon and the icon's own colour on it. The colour only helps
   * to find a circle again; the word is always under it.
   */
  modules: Record<ModuleTone, { background: string; icon: string }>;
  /**
   * The filled home circles (#352): the module's deep colour with a white icon, the same in light and dark (white on
   * each is 4.5:1 or more).
   */
  moduleSolid: Record<ModuleTone, string>;
};

/** The kinds of small status label, each with its own colours. */
export type ChipTone = 'info' | 'success' | 'warning' | 'neutral' | 'paused' | 'danger' | 'level';

/**
 * The module colours: students green, attendance blue, calls purple, news orange, groups pink, here now teal,
 * syllabus and lessons indigo (round 7).
 */
export type ModuleTone = 'green' | 'blue' | 'purple' | 'orange' | 'pink' | 'teal' | 'indigo';

function fromTokens(scheme: 'light' | 'dark'): Palette {
  const s = semantic[scheme];
  return {
    ...s,
    headerTop: s.header,
    headerBottom: s.headerDeep,
    chips: chips[scheme],
    modules: modules[scheme],
    moduleSolid: Object.fromEntries(Object.entries(modules.light).map(([tone, look]) => [tone, look.icon])) as Record<ModuleTone, string>,
  };
}

// Contrast: every text colour 4.5:1 or more on its background, controls and icons 3:1, in both schemes and
// for every palette choice — checked by app/tests/design-tokens.test.mjs (pairs in design/tokens.json).
export const lightPalette: Palette = fromTokens('light');

/**
 * Colours of a QR code, the same in light and dark mode. Scanners look for dark squares on a
 * light background; many cannot read a code drawn light on dark, so the code never follows the
 * dark theme.
 */
export const qrColours = {
  dark: '#000000',
  light: '#FFFFFF',
} as const;

/** The same colour names for the phone's dark mode. */
export const darkPalette: Palette = fromTokens('dark');
