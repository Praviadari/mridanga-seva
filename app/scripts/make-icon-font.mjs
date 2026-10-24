// Makes the app's own icon font (docs/DECISIONS.md #592; audit 22-10-2026 fix 14): only the Ionicons shapes the app
// uses (src/components/icon.tsx SHAPES, and the filled twin of each outline for the open tab), instead of the whole
// Ionicons font (381 KB, 1,300+ shapes) that every web visit downloaded. Writes:
//   assets/fonts/app-icons.ttf        the shapes, cut from @expo/vector-icons' Ionicons.ttf (MIT licence, kept in the
//                                     font's own name table)
//   src/components/icon-glyphs.ts     name -> character of each kept shape, for createIconSet
// Run from app/ after adding or changing an icon in SHAPES:  npm run icons
// Needs Python 3 with fontTools (pip install fonttools). tests/icon-font.test.mjs fails while the font is out of date.

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import { glyphNames, glyphsSource, shapesIn } from './lib/icon-font.mjs';

const require = createRequire(import.meta.url);
const vendor = join(dirname(require.resolve('@expo/vector-icons/package.json')), 'build', 'vendor', 'react-native-vector-icons');
const glyphMap = JSON.parse(readFileSync(join(vendor, 'glyphmaps', 'Ionicons.json'), 'utf8'));

const shapes = shapesIn(readFileSync(join('src', 'components', 'icon.tsx'), 'utf8'));
const names = glyphNames(shapes, glyphMap);
const missing = shapes.filter((name) => !(name in glyphMap));
if (missing.length) {
  console.error(`make-icon-font: not in Ionicons: ${missing.join(', ')}`);
  process.exit(1);
}
const unicodes = names.map((name) => glyphMap[name].toString(16)).join(',');
const python = process.platform === 'win32' ? 'python' : 'python3';
const run = spawnSync(
  python,
  [
    '-m', 'fontTools.subset', join(vendor, 'Fonts', 'Ionicons.ttf'),
    `--unicodes=${unicodes}`,
    '--output-file=' + join('assets', 'fonts', 'app-icons.ttf'),
    '--no-hinting',
    '--layout-features=',
    '--name-IDs=*',
    '--notdef-outline',
  ],
  { stdio: 'inherit' },
);
if (run.status !== 0) {
  console.error('make-icon-font: fontTools failed (pip install fonttools).');
  process.exit(1);
}
writeFileSync(join('src', 'components', 'icon-glyphs.ts'), glyphsSource(names, glyphMap));
console.log(`make-icon-font: ${names.length} shapes written to assets/fonts/app-icons.ttf and src/components/icon-glyphs.ts.`);
