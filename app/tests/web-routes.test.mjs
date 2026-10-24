// Unit tests for the web version's smaller first download (docs/DECISIONS.md #590-#592; audit 22-10-2026 fix 14): the
// web start file and its screen list (every route once: the staff screens as stand-ins loaded from one later file, the
// staff layouts in the first download), the list of staff screens kept current, the phones untouched, the service
// worker leaving the staff file out of its install list, and the app's own icon font. The browser walk on a local copy
// of the export is in NOTES_bundle_door_queue.md. Run from app/: npm test.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const { listIsCurrent, staffScreenFiles } = await import('../scripts/lib/staff-screens.mjs');
const { shellFiles, staffChunk } = await import('../scripts/lib/offline-shell.mjs');
const { glyphNames, shapesIn } = await import('../scripts/lib/icon-font.mjs');

const require = createRequire(import.meta.url);
const appDir = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

/** The first regular expression literal passed to require.context in `source`. */
function contextRegex(source) {
  const match = /require\.context\('[^']+', true, \/(.+)\/\)/.exec(source);
  assert.ok(match, 'require.context with a regular expression');
  return new RegExp(match[1]);
}

/** Every .tsx route key of src/app, as Expo Router names them ('./staff/register.tsx'). */
function allRouteKeys() {
  const keys = [];
  const walk = (dir, prefix) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path, `${prefix}${name}/`);
      else if (name.endsWith('.tsx')) keys.push(`./${prefix}${name}`);
    }
  };
  walk(join(appDir, 'src', 'app'), '');
  return keys;
}

test('the list of staff screens matches src/app/staff (a new staff screen would be missing on the web)', () => {
  assert.ok(listIsCurrent(appDir), 'run: npm run staff-screens');
  const list = staffScreenFiles(appDir);
  assert.ok(list.includes('register.tsx') && list.includes('(tabs)/index.tsx') && list.includes('fund/[id].tsx'));
  assert.ok(!list.includes('_layout.tsx') && !list.includes('(tabs)/_layout.tsx'), 'the layouts stay in the first download');
  assert.match(read('scripts/export-web.mjs'), /listIsCurrent\(\)/, 'export-web refuses a stale list');
});

test('every route is known once: the first download has all but the staff screens, the staff file has exactly those', () => {
  const keys = allRouteKeys();
  const first = contextRegex(read('src/web-routes/route-context.ts'));
  const staffArea = contextRegex(read('src/web-routes/staff-area.ts'));
  const staffList = new Set(staffScreenFiles(appDir).map((path) => `./staff/${path}`));
  for (const key of keys) {
    const isStaffScreen = staffList.has(key);
    assert.equal(first.test(key), !isStaffScreen, `first download: ${key}`);
    if (key.startsWith('./staff/')) assert.equal(staffArea.test(key.replace(/^\.\/staff\//, './')), isStaffScreen, `staff area: ${key}`);
  }
  for (const layout of ['./staff/_layout.tsx', './staff/(tabs)/_layout.tsx', './_layout.tsx', './student/_layout.tsx']) assert.ok(first.test(layout), layout);
  assert.ok(first.test('./student/(tabs)/my-qr.tsx') && first.test('./waiting/practice.tsx') && first.test('./sign-in.tsx'));
});

test('the web starts from its own file with that list; the phones keep Expo Router\'s own start', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.main, './src/entry');
  assert.match(read('src/entry.ts'), /^import 'expo-router\/entry';$/m);
  const web = read('src/entry.web.tsx');
  assert.ok(web.indexOf("import '@expo/metro-runtime';") < web.indexOf('renderRootComponent'), 'metro-runtime first, as Expo Router does');
  assert.match(web, /renderRootComponent\(App\);/);
  assert.match(read('src/web-routes/app.tsx'), /<ExpoRoot context=\{routeContext\} \/>/);
  // The staff area is reached only through import(), so the export makes it a file of its own.
  const lazy = read('src/web-routes/lazy-staff.tsx');
  assert.match(lazy, /import\('\.\/staff-area'\)/);
  assert.doesNotMatch(read('src/web-routes/route-context.ts'), /from '\.\/staff-area'/);
  // A failed load is forgotten, so Try again asks again; the loaded file is handed to the service worker.
  assert.match(lazy, /loading = null;\s*throw error;/);
  assert.match(lazy, /keepOfflineShell\(\);/);
  // A staff login starts the download; on phones nothing happens.
  assert.match(read('src/app/_layout.tsx'), /if \(area === 'guru' \|\| area === 'coordinator'\) preloadStaffArea\(\);/);
  assert.match(read('src/lib/staff-area.ts'), /export function preloadStaffArea\(\): void \{\}/);
});

test('the service worker keeps the staff file only on a phone that loaded it, never at install', () => {
  assert.ok(staffChunk('/_expo/static/js/web/staff-area-5149a0c213be47bda386c96fb0686321.js'));
  assert.ok(!staffChunk('/_expo/static/js/web/entry-5149a0c2.js'));
  const dist = mkdtempSync(join(tmpdir(), 'web-routes-'));
  try {
    for (const file of ['index.html', '_expo/static/js/web/entry-abc.js', '_expo/static/js/web/staff-area-0123abcd.js', '_expo/static/js/web/index-9f.js',
      'assets/assets/fonts/CormorantGaramond-SemiBold.a5.ttf', 'assets/assets/fonts/NotoSerifTelugu-SemiBold.24.ttf',
      'assets/assets/fonts/NotoSerifDevanagari-SemiBold.f8.ttf', 'assets/assets/fonts/app-icons.d7.ttf']) {
      mkdirSync(join(dist, file, '..'), { recursive: true });
      writeFileSync(join(dist, file), 'x');
    }
    // The Telugu and Hindi heading fonts are kept when the page loads them, like the language scripts.
    assert.deepEqual(shellFiles(dist).shell, ['/', '/_expo/static/js/web/entry-abc.js', '/_expo/static/js/web/index-9f.js',
      '/assets/assets/fonts/CormorantGaramond-SemiBold.a5.ttf', '/assets/assets/fonts/app-icons.d7.ttf'].sort());
  } finally {
    rmSync(dist, { recursive: true, force: true });
  }
});

test('icons: the app\'s font holds every shape SHAPES names and its filled twin, and nothing of Ionicons beyond', () => {
  const icon = read('src/components/icon.tsx');
  assert.doesNotMatch(icon, /@expo\/vector-icons\/Ionicons/, 'not the whole Ionicons font');
  assert.match(icon, /createIconSet\(GLYPHS, 'mridanga-icons', require\('\.\.\/\.\.\/assets\/fonts\/app-icons\.ttf'\)\)/);
  const vendor = join(dirname(require.resolve('@expo/vector-icons/package.json')), 'build', 'vendor', 'react-native-vector-icons');
  const ionicons = JSON.parse(readFileSync(join(vendor, 'glyphmaps', 'Ionicons.json'), 'utf8'));
  const wanted = glyphNames(shapesIn(icon), ionicons);
  const glyphs = Object.fromEntries([...read('src/components/icon-glyphs.ts').matchAll(/'([a-z0-9-]+)': (\d+),/g)].map((m) => [m[1], Number(m[2])]));
  assert.deepEqual(Object.keys(glyphs).sort(), wanted, 'run: npm run icons');
  for (const name of wanted) assert.equal(glyphs[name], ionicons[name], name);
  for (const name of shapesIn(icon)) assert.ok(name in glyphs, name);
  const font = join(appDir, 'assets', 'fonts', 'app-icons.ttf');
  assert.ok(existsSync(font));
  assert.ok(statSync(font).size < 80 * 1024, `the font stays small (${statSync(font).size} bytes)`);
});
