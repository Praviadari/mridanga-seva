// Unit tests for the web version's smaller first download (docs/DECISIONS.md #590-#592, #650; audit 22-10-2026 fix 14):
// the web start file and its screen list (every route once: the staff screens and the student screens beyond the tabs as
// stand-ins loaded from one later file per area, the layouts in the first download), the lists kept current, the shared
// code of the areas folded into the area files, the phones untouched, the service worker leaving the staff file out of
// its install list, and the app's own icon font. The browser walk on a local copy
// of the export is in NOTES_bundle_door_queue.md. Run from app/: npm test.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const { areaOf, areaScreenFiles, listIsCurrent } = await import('../scripts/lib/area-screens.mjs');
const { foldCommon } = await import('../scripts/lib/fold-common.mjs');
const { shellFiles, staffChunk } = await import('../scripts/lib/offline-shell.mjs');
const { glyphNames, shapesIn } = await import('../scripts/lib/icon-font.mjs');

const require = createRequire(import.meta.url);
const appDir = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

/** The first regular expression literal passed to require.context in `source`. */
function contextRegex(source) {
  const match = /require\.context\(\s*'[^']+',\s*true,\s*\/(.+)\/,?\s*\)/.exec(source);
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

test('the lists of later screens match src/app (a new screen would be missing on the web)', () => {
  assert.ok(listIsCurrent(appDir), 'run: npm run area-screens');
  const { staff, student } = areaScreenFiles(appDir);
  assert.ok(staff.includes('staff/register.tsx') && staff.includes('staff/(tabs)/index.tsx') && staff.includes('staff/fund/[id].tsx'));
  assert.ok(!staff.includes('staff/_layout.tsx') && !staff.includes('staff/(tabs)/_layout.tsx'), 'the layouts stay in the first download');
  for (const path of ['student/practice.tsx', 'student/my-qr.tsx', 'student/announcements.tsx', 'student/echo-me.tsx', 'student/lesson/[id].tsx', 'waiting/practice.tsx', 'waiting/lessons.tsx']) {
    assert.ok(student.includes(path), path);
  }
  for (const path of ['student/_layout.tsx', 'student/(tabs)/index.tsx', 'student/(tabs)/my-practice.tsx', 'waiting/_layout.tsx', 'subscriber/ishtagoshti/slokas.tsx']) {
    assert.equal(areaOf(path), null, path);
  }
  assert.match(read('scripts/export-web.mjs'), /listIsCurrent\(\)/, 'export-web refuses stale lists');
});

test('every route is known once: the first download has all but the later screens, each area file has exactly its own', () => {
  const first = contextRegex(read('src/web-routes/route-context.ts'));
  const staffArea = contextRegex(read('src/web-routes/staff-area.ts'));
  const studentArea = contextRegex(read('src/web-routes/student-area.ts'));
  for (const key of allRouteKeys()) {
    const area = areaOf(key.slice(2));
    assert.equal(first.test(key), area === null, `first download: ${key}`);
    assert.equal(staffArea.test(key), area === 'staff', `staff area: ${key}`);
    assert.equal(studentArea.test(key), area === 'student', `student area: ${key}`);
  }
  for (const layout of ['./staff/_layout.tsx', './staff/(tabs)/_layout.tsx', './_layout.tsx', './student/_layout.tsx']) assert.ok(first.test(layout), layout);
  assert.ok(first.test('./student/(tabs)/index.tsx') && first.test('./student/(tabs)/my-practice.tsx') && first.test('./sign-in.tsx'));
  assert.ok(!first.test('./waiting/practice.tsx') && !first.test('./student/practice.tsx'));
});

test('the web starts from its own file with that list; the phones keep Expo Router\'s own start', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.main, './src/entry');
  assert.match(read('src/entry.ts'), /^import 'expo-router\/entry';$/m);
  const web = read('src/entry.web.tsx');
  assert.ok(web.indexOf("import '@expo/metro-runtime';") < web.indexOf('renderRootComponent'), 'metro-runtime first, as Expo Router does');
  assert.match(web, /renderRootComponent\(App\);/);
  assert.match(read('src/web-routes/app.tsx'), /<ExpoRoot context=\{routeContext\} \/>/);
  // Each area is reached only through import(), so the export makes it a file of its own.
  const lazy = read('src/web-routes/lazy-area.tsx');
  assert.match(lazy, /import\('\.\/staff-area'\)/);
  assert.match(lazy, /import\('\.\/student-area'\)/);
  assert.doesNotMatch(read('src/web-routes/route-context.ts'), /from '\.\/(staff|student)-area'/);
  // A failed load is forgotten, so Try again asks again; the loaded file is handed to the service worker.
  assert.match(lazy, /loading\.delete\(name\);\s*throw error;/);
  assert.match(lazy, /keepOfflineShell\(\);/);
  // A login starts its download (staff at once, a student's a moment after the home); on phones nothing happens.
  assert.match(read('src/app/_layout.tsx'), /preloadAreasFor\(area\);/);
  const areas = read('src/lib/web-areas.web.ts');
  assert.match(areas, /if \(area === 'guru' \|\| area === 'coordinator'\) preloadArea\('staff'\);/);
  assert.match(areas, /area === 'student' \|\| area === 'pending'/);
  assert.match(read('src/lib/web-areas.ts'), /export function preloadAreasFor\(_area: string\): void \{\}/);
});

test('the shared code of the areas goes into each area file, never into index.html (#650)', () => {
  const dist = mkdtempSync(join(tmpdir(), 'fold-common-'));
  const web = join(dist, '_expo', 'static', 'js', 'web');
  try {
    mkdirSync(web, { recursive: true });
    const put = (name, text) => writeFileSync(join(web, name), text);
    put('__common-c0.js', '__d(function(){},9,[]);');
    put('staff-area-a1.js', '__d(function(){},7,[9]);');
    put('student-area-b2.js', '__d(function(){},8,[9]);');
    put('te-d4.js', '__d(function(){},5,[]);');
    put('entry-e5.js', 'x({"paths":{"7":"/_expo/static/js/web/staff-area-a1.js","8":"/_expo/static/js/web/student-area-b2.js"}});');
    writeFileSync(join(dist, 'index.html'), '<script src="/_expo/static/js/web/__common-c0.js" defer></script><script src="/_expo/static/js/web/entry-e5.js" defer></script>');
    const done = foldCommon(dist);
    const names = readdirSync(web);
    assert.ok(!names.some((name) => name.startsWith('__common')), 'no __common left');
    const staff = names.find((name) => name.startsWith('staff-area-'));
    const student = names.find((name) => name.startsWith('student-area-'));
    const entry = names.find((name) => name.startsWith('entry-'));
    assert.notEqual(staff, 'staff-area-a1.js', 'a new name for new content');
    assert.equal(readFileSync(join(web, staff), 'utf8'), '__d(function(){},9,[]);\n__d(function(){},7,[9]);');
    assert.equal(readFileSync(join(web, student), 'utf8'), '__d(function(){},9,[]);\n__d(function(){},8,[9]);');
    assert.ok(names.includes('te-d4.js'), 'other files untouched');
    assert.match(readFileSync(join(web, entry), 'utf8'), new RegExp(`"7":"/_expo/static/js/web/${staff}","8":"/_expo/static/js/web/${student}"`));
    assert.equal(readFileSync(join(dist, 'index.html'), 'utf8'), `<script src="/_expo/static/js/web/${entry}" defer></script>`);
    assert.equal(done.renamed['entry-e5.js'], entry);
    assert.equal(foldCommon(dist), null, 'nothing to fold the second time');
    // An entry that does not name an area as expected stops the export.
    put('__common-c1.js', '__d(function(){},9,[]);');
    put('staff-area-a2.js', '__d(function(){},7,[9]);');
    assert.throws(() => foldCommon(dist), /names|expected/);
  } finally {
    rmSync(dist, { recursive: true, force: true });
  }
  assert.match(read('scripts/export-web.mjs'), /foldCommon\(DIST\)/);
});
test('the service worker keeps the staff file only on a phone that loaded it, the student file at install', () => {
  assert.ok(staffChunk('/_expo/static/js/web/staff-area-5149a0c213be47bda386c96fb0686321.js'));
  assert.ok(!staffChunk('/_expo/static/js/web/entry-5149a0c2.js'));
  const dist = mkdtempSync(join(tmpdir(), 'web-routes-'));
  try {
    for (const file of ['index.html', '_expo/static/js/web/entry-abc.js', '_expo/static/js/web/staff-area-0123abcd.js', '_expo/static/js/web/student-area-4567ef.js', '_expo/static/js/web/index-9f.js',
      'assets/assets/fonts/CormorantGaramond-SemiBold.a5.ttf', 'assets/assets/fonts/NotoSerifTelugu-SemiBold.24.ttf',
      'assets/assets/fonts/NotoSerifDevanagari-SemiBold.f8.ttf', 'assets/assets/fonts/app-icons.d7.ttf']) {
      mkdirSync(join(dist, file, '..'), { recursive: true });
      writeFileSync(join(dist, file), 'x');
    }
    // The Telugu and Hindi heading fonts are kept when the page loads them, like the language scripts.
    assert.deepEqual(shellFiles(dist).shell, ['/', '/_expo/static/js/web/entry-abc.js', '/_expo/static/js/web/index-9f.js', '/_expo/static/js/web/student-area-4567ef.js',
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
