// Design tokens (docs/DECISIONS.md #336-#338): design/tokens.json is the one source of the app's and the
// website's colours; the generated files must be up to date, every text colour 4.5:1 on its background in
// light and dark (and for every palette choice the team may make), controls and icons 3:1.
// Run from app/: npm test. To change a colour: edit design/tokens.json, run node design/build-tokens.mjs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';

import { CSS_FILE, TS_FILE, allChoices, contrast, contrastReport, loadTokens, palette, renderCss, renderTs } from '../../design/tokens.mjs';

const repo = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, repo), 'utf8');
const tokens = loadTokens();

test('the contrast formula gives the WCAG values', () => {
  assert.equal(Math.round(contrast('#000000', '#FFFFFF') * 100) / 100, 21);
  assert.equal(Math.round(contrast('#FFFFFF', '#FFFFFF') * 100) / 100, 1);
  // #9A4307 on the page (#FBF5EC): 6.09 in the audit's table (u3-contrast-out.md).
  assert.equal(Math.round(contrast('#9A4307', '#FBF5EC') * 100) / 100, 6.09);
});

test('the generated app theme and website CSS are up to date (run node design/build-tokens.mjs)', () => {
  assert.equal(read(TS_FILE), renderTs(tokens), `${TS_FILE} is stale`);
  assert.equal(read(CSS_FILE), renderCss(tokens), `${CSS_FILE} is stale`);
});

test('every text colour is 4.5:1 or more, every control and icon 3:1, light and dark, every palette choice', () => {
  const rows = contrastReport(tokens);
  const low = rows.filter((r) => !r.ok).map((r) => `${r.where}: ${r.fg} on ${r.bg} = ${r.ratio} (< ${r.min})`);
  assert.deepEqual(low, []);
  // Two schemes x four choices, all declared pairs, the chips and the website's pairs.
  assert.equal(allChoices(tokens).length, 4);
  assert.ok(rows.length >= 500, `${rows.length} pairs`);
});

test('the default palette is option A: royal-blue header with gold, deep saffron #9A4307 (Praveen 14-10-2026, #352)', () => {
  assert.deepEqual(tokens.choices, { header: 'indigo', primary: 'deep' });
  const light = palette(tokens, 'light');
  assert.equal(light.primary, '#9A4307');
  // The band runs from deep night (headerDeep) at the top to royal blue (header) below; the app's name is gold.
  assert.equal(light.header, '#22307A');
  assert.equal(light.headerDeep, '#0B0C26');
  // The brighter gold for every header title (Praveen 16-10-2026, #373; was #FFD27A).
  assert.equal(light.headerGold, '#FFC845');
  // Option B keeps the saffron header; "bright" keeps today's #B45309: both stay one line away.
  assert.equal(palette(tokens, 'light', { header: 'saffron', primary: 'bright' }).primary, '#B45309');
  assert.equal(palette(tokens, 'light', { header: 'saffron', primary: 'deep' }).header, '#9A4307');
});

test('every semantic colour exists in both schemes and resolves to a colour', () => {
  for (const choices of allChoices(tokens)) {
    const light = palette(tokens, 'light', choices);
    const dark = palette(tokens, 'dark', choices);
    assert.deepEqual(Object.keys(light).sort(), Object.keys(dark).sort());
    for (const value of [...Object.values(light), ...Object.values(dark)]) {
      assert.match(value, /^(#[0-9A-F]{6}|rgba\(.+\)|transparent)$/, value);
    }
  }
});

test('the website takes its colours from tokens.css only; build.mjs puts it before styles.css', () => {
  const styles = read('website/src/styles.css');
  assert.doesNotMatch(styles, /^\s*--(bg|paper|ink|muted|accent|night|link):/m, 'a colour variable is set in styles.css');
  assert.match(read('website/src/build.mjs'), /readFileSync\(join\(root, 'src', 'tokens\.css'\)\)/);
});

test('the open tab\'s filled icons exist in Ionicons', () => {
  const glyphs = JSON.parse(
    readFileSync(new URL('../node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json', import.meta.url), 'utf8'),
  );
  const icon = read('app/src/components/icon.tsx');
  const shapeOf = (name) => icon.match(new RegExp(`^  ${name}: '([a-z-]+)',`, 'm'))?.[1];
  const used = new Set();
  for (const layout of ['app/src/app/staff/(tabs)/_layout.tsx', 'app/src/app/student/(tabs)/_layout.tsx', 'app/src/app/subscriber/(tabs)/_layout.tsx']) {
    for (const [, name] of read(layout).matchAll(/tabIcon\('([A-Za-z]+)'\)/g)) used.add(name);
  }
  assert.ok(used.size >= 8, [...used].join(' '));
  for (const name of used) {
    const outline = shapeOf(name);
    assert.ok(outline && glyphs[outline] !== undefined, `${name}: ${outline}`);
    assert.ok(glyphs[outline.replace(/-outline$/, '')] !== undefined, `${name}: no filled twin of ${outline}`);
  }
});

test('the heading font is the subset Cormorant Garamond with its licence, small enough for an update', () => {
  const file = new URL(tokens.font.serifFile, repo);
  assert.ok(statSync(file).size < 200 * 1024, `${statSync(file).size} bytes`);
  assert.match(read('app/assets/fonts/OFL-cormorant-garamond.txt'), /SIL Open Font License/);
  // Loaded at run time (an update), never through the expo-font config plugin (that would need an APK).
  assert.doesNotMatch(read('app/app.json'), /expo-font/);
  // Since #367 by expo-font's loadAsync, the current language's font only.
  assert.match(read('app/src/theme/fonts.tsx'), /loadAsync\(\{ \[family\]: source \}\)/);
});
