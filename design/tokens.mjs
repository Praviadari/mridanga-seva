// Reads design/tokens.json and turns it into the app's theme file and the website's CSS variables, and
// measures the contrast of every declared pair (docs/DECISIONS.md #336). Node only, no dependencies,
// like website/. Used by build-tokens.mjs (writes the files) and app/tests/design-tokens.test.mjs.

import { readFileSync } from 'node:fs';

export const repo = new URL('../', import.meta.url);
export const TS_FILE = 'app/src/theme/tokens.generated.ts';
export const CSS_FILE = 'website/src/tokens.css';

/** The parsed tokens.json. */
export function loadTokens() {
  return JSON.parse(readFileSync(new URL('design/tokens.json', repo), 'utf8'));
}

/** A literal colour or CSS value, or a primitive 'family.step' turned into its hex. */
export function resolve(tokens, value) {
  if (typeof value !== 'string') throw new Error(`token value must be a string: ${JSON.stringify(value)}`);
  if (/^#[0-9A-Fa-f]{6}$/.test(value) || /^(rgba?\(|transparent$)/.test(value) || /\s|px$/.test(value)) return value;
  const [family, step] = value.split('.');
  const hex = tokens.primitive[family]?.[step];
  if (!hex) throw new Error(`unknown primitive ${value}`);
  return hex;
}

/** Every combination of the choices (header x primary), the chosen one first. */
export function allChoices(tokens) {
  const out = [tokens.choices];
  for (const header of Object.keys(tokens.choiceValues.header)) {
    for (const primary of Object.keys(tokens.choiceValues.primary)) {
      if (header !== tokens.choices.header || primary !== tokens.choices.primary) out.push({ header, primary });
    }
  }
  return out;
}

/** The semantic colours of one scheme ('light' | 'dark') for the given choices, as hex. */
export function palette(tokens, scheme, choices = tokens.choices) {
  const header = tokens.choiceValues.header[choices.header];
  const primary = tokens.choiceValues.primary[choices.primary];
  if (!header || !primary) throw new Error(`unknown choice ${JSON.stringify(choices)}`);
  const merged = { ...tokens.semantic[scheme], ...header[scheme], ...primary[scheme] };
  return Object.fromEntries(Object.entries(merged).map(([name, value]) => [name, resolve(tokens, value)]));
}

/** The website's variables of one scheme: dark repeats light's and overrides some, as the CSS cascade does. */
export function websiteVars(tokens, scheme) {
  const merged = scheme === 'dark' ? { ...tokens.website.light, ...tokens.website.dark } : tokens.website.light;
  return Object.fromEntries(Object.entries(merged).map(([name, value]) => [name, resolve(tokens, value)]));
}

function channel(c) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance of a #RRGGBB colour. */
export function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

/** WCAG contrast ratio of two #RRGGBB colours, 1 to 21. */
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Every declared pair in both schemes and every combination of choices, plus the chips and the home circles.
 * Returns one row per pair: { where, fg, bg, ratio, min, ok }.
 */
export function contrastReport(tokens) {
  const rows = [];
  const add = (where, fgName, bgName, fg, bg, min) => {
    const ratio = contrast(fg, bg);
    rows.push({ where, fg: `${fgName} ${fg}`, bg: `${bgName} ${bg}`, ratio: Math.round(ratio * 100) / 100, min, ok: ratio >= min });
  };
  for (const choices of allChoices(tokens)) {
    for (const scheme of ['light', 'dark']) {
      const p = palette(tokens, scheme, choices);
      const where = `${scheme} ${choices.header}/${choices.primary}`;
      for (const [fg, bg] of tokens.pairs.text) add(where, fg, bg, p[fg], p[bg], 4.5);
      for (const [fg, bg] of tokens.pairs.nonText) add(where, fg, bg, p[fg], p[bg], 3);
      for (const [tone, [fg, bg]] of Object.entries(tokens.chips)) add(where, `chip ${tone}`, bg, p[fg], p[bg], 4.5);
    }
  }
  for (const scheme of ['light', 'dark']) {
    // Icons on their tint: non-text, but kept at 4.5 since round 4.
    for (const [tone, [bg, icon]] of Object.entries(tokens.modules[scheme])) add(`${scheme} modules`, `${tone} icon`, 'tint', icon, bg, 4.5);
    const site = websiteVars(tokens, scheme);
    for (const [fg, bg] of tokens.pairs.website) add(`website ${scheme}`, fg, bg, site[fg], site[bg], 4.5);
  }
  return rows;
}

const HEADER = 'written by design/build-tokens.mjs from design/tokens.json; do not edit (docs/DECISIONS.md #336).';

function chipsOf(tokens, p) {
  return Object.fromEntries(Object.entries(tokens.chips).map(([tone, [text, background]]) => [tone, { text: p[text], background: p[background] }]));
}

function modulesOf(tokens, scheme) {
  return Object.fromEntries(Object.entries(tokens.modules[scheme]).map(([tone, [background, icon]]) => [tone, { background, icon }]));
}

const json = (value) => JSON.stringify(value, null, 2).replace(/"([A-Za-z_][A-Za-z0-9_]*)":/g, '$1:').replace(/"/g, "'");

/** The text of app/src/theme/tokens.generated.ts. */
export function renderTs(tokens) {
  const light = palette(tokens, 'light');
  const dark = palette(tokens, 'dark');
  return `// ${TS_FILE}: ${HEADER}
// Choices (team decision, audit phase 5 question 1): header ${tokens.choices.header}, primary ${tokens.choices.primary}.

/** The team's palette choices this file was made with. */
export const choices = ${json(tokens.choices)} as const;

/** Semantic colours per scheme, as hex (or rgba for overlays). */
export const semantic = ${json({ light, dark })} as const;

/** Small status labels: text and background per tone. */
export const chips = ${json({ light: chipsOf(tokens, light), dark: chipsOf(tokens, dark) })} as const;

/** The home circles' colours: a pale tint and the icon on it. */
export const modules = ${json({ light: modulesOf(tokens, 'light'), dark: modulesOf(tokens, 'dark') })} as const;

/** Space between things, in density-independent pixels. */
export const space = ${json(tokens.space)} as const;

/** Corner roundness. */
export const radii = ${json(tokens.radii)} as const;

/** The heading font's name as expo-font registers it. */
export const serifFont = '${tokens.font.serif}';

/** Sizes of the serif headings (English). */
export const serifType = ${json({ title: tokens.type.serifTitle, subtitle: tokens.type.serifSubtitle })} as const;
`;
}

/** The text of website/src/tokens.css. */
export function renderCss(tokens) {
  const block = (vars, indent) =>
    Object.entries(vars)
      .map(([name, value]) => `${indent}${name}: ${/^#/.test(value) ? value.toLowerCase() : value};`)
      .join('\n');
  const dark = Object.fromEntries(Object.keys(tokens.website.dark).map((name) => [name, websiteVars(tokens, 'dark')[name]]));
  return `/* ${CSS_FILE}: ${HEADER}
   The website's colours and shadows. build.mjs puts this file before styles.css. */

:root {
  color-scheme: light dark;
${block(websiteVars(tokens, 'light'), '  ')}
}

@media (prefers-color-scheme: dark) {
  :root {
${block(dark, '    ')}
  }
}
`;
}
