// Builds the web version into dist/, ready to upload to the web host
// (docs/OPERATIONS.md "Publishing the web version"). Run from app/:
//   npm run export:web -- --site test   test site (mridanga-seva-test): settings from app/.env.test
//   npm run export:web -- --site live   live site (mridanga-seva): settings from app/.env.live
// Without --site it stops: which project a site talks to is never guessed (docs/DECISIONS.md #145).
//
// 1. Reads EXPO_PUBLIC_SUPABASE_URL and _KEY from the site's file and checks that the URL names
//    that site's project (PROJECTS). They go to `expo export --platform web --clear` in the
//    environment, with EXPO_NO_DOTENV=1 so Expo itself loads no .env file at all (audit D11-08:
//    it used to load app/.env, the live values, into every export). --clear stops Metro's cache
//    from keeping an older value (seen 29-09-2026: the cache kept an empty key and the site said
//    "App not set up"). EXPO_PUBLIC_BUILD = "<site> <commit> <time>" is shown under Sign out.
// 2. Moves dist/assets/node_modules to dist/assets/vendor and rewrites the paths in the
//    exported files. Expo puts images that come from packages (the header back arrow, for
//    example) under a folder named node_modules, and Cloudflare Pages never uploads a folder
//    with that name, so those images would be missing on the live site.
// 3. Refuses to finish if the export holds the Supabase secret (service_role) key. Everything
//    in EXPO_PUBLIC_* is readable by anyone who opens the site, and that key bypasses every
//    access rule. The app itself also refuses to start with it (src/lib/supabase.ts).
// 4. Checks that the export holds exactly the URL and key from the site's file and never names
//    the other project, so a test site never talks to the live project or the other way round.
// 5. Copies the QR reader (zxing-wasm's zxing_reader.wasm) to dist/zxing/<version>/ after
//    checking its SHA-256 against the one barcode-detector was published with, so browsers load
//    it from this site and not from a CDN (src/lib/qr-reader.web.ts, DECISIONS #143).
// 6. Writes dist/_headers from public/_headers (DECISIONS #142): this site's Supabase address
//    and the SHA-256 of the lesson player's script go into the Content-Security-Policy.
// 7. Writes dist/version.txt (site, commit, time, project), the same build id the app shows.
// 8. Warns if dist/404.html exists: Cloudflare Pages then stops sending every address to
//    index.html, which this single-page app needs (docs/DECISIONS.md #15).
//
// Uses only Node's built-in modules (and reads two installed packages). Exits with code 1 if
// dist/ must not be uploaded.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { holdsSecretKey, listFiles, SETTING_NAMES, supabaseSettingsFrom } from './bundle-checks.mjs';

const DIST = 'dist';
const FROM = '/assets/node_modules/';
const TO = '/assets/vendor/';
/** Files that can hold paths to assets. Images are left alone. */
const TEXT_FILES = new Set(['.js', '.html', '.css', '.json', '.map']);

/**
 * Each site, its settings file and its Supabase project. The same refs as the channels in
 * scripts/publish-update.mjs: test = the test project (dummy data), live = the class's project.
 */
const SITES = {
  test: { file: '.env.test', project: 'fhuqykssenuhczdqbafu', host: 'mridanga-seva-test' },
  live: { file: '.env.live', project: 'qeozvvizcojzxcjgnaei', host: 'mridanga-seva' },
};

/** Stops the script with a message and exit code 1. */
function fail(message) {
  console.error('export-web: ' + message);
  process.exit(1);
}

/** The site named after --site; stops without one. */
function siteFromArgs(args) {
  const i = args.indexOf('--site');
  const name = i === -1 ? undefined : args[i + 1];
  if (!name || !(name in SITES)) {
    fail('say which site to build: npm run export:web -- --site test   (or --site live, only for the class site).');
  }
  if (args.includes('--env')) fail('--env is gone: --site picks the settings file (OPERATIONS.md "Publishing the web version").');
  return name;
}

/** EXPO_PUBLIC_SUPABASE_URL and _KEY from a .env-style file, as { name: value }. */
function readSettings(file) {
  if (!existsSync(file)) fail(`${file} not found in app/. See app/README.md "Settings files".`);
  const settings = supabaseSettingsFrom(readFileSync(file, 'utf8'));
  for (const name of SETTING_NAMES) {
    if (!settings[name]) fail(`${name} is missing or empty in ${file}.`);
  }
  return settings;
}

/** The package.json of package `name`, found upwards from one of its files (it does not export its package.json). */
function packageJsonOf(file, name) {
  for (let dir = dirname(file); dir !== dirname(dir); dir = dirname(dir)) {
    const candidate = join(dir, 'package.json');
    if (existsSync(candidate) && JSON.parse(readFileSync(candidate, 'utf8')).name === name) return candidate;
  }
  return fail(`package ${name} not found; run npm ci.`);
}

/** Output of a git command, or '' if git is missing. */
function git(...args) {
  const run = spawnSync('git', args, { encoding: 'utf8' });
  return run.status === 0 ? run.stdout.trim() : '';
}

// ---------------------------------------------------------------- 1. settings and export
const siteName = siteFromArgs(process.argv.slice(2));
const site = SITES[siteName];
const otherProject = Object.values(SITES).find((s) => s !== site).project;
const settings = readSettings(site.file);
const supabaseOrigin = `https://${site.project}.supabase.co`;
if (settings.EXPO_PUBLIC_SUPABASE_URL.replace(/\/+$/, '') !== supabaseOrigin) {
  fail(
    `${site.file} points to ${settings.EXPO_PUBLIC_SUPABASE_URL}, but the ${siteName} site must use ${supabaseOrigin}. ` +
      'Fix the file; nothing was built.',
  );
}
if (holdsSecretKey(settings.EXPO_PUBLIC_SUPABASE_KEY)) fail(`${site.file} holds a secret key. Put the publishable key there.`);

const commit = git('rev-parse', '--short=7', 'HEAD') || 'unknown';
const changed = git('status', '--porcelain', '--untracked-files=no') !== '';
const build = `${siteName} ${commit}${changed ? '+changes' : ''} ${new Date().toISOString()}`;
console.log(`export-web: building the ${siteName} site for ${supabaseOrigin} (from ${site.file}), build ${build}`);

// Run Expo's own CLI with this Node, so no shell is needed on Windows.
const require = createRequire(import.meta.url);
const expoCli = require.resolve('expo/bin/cli');
const run = spawnSync(process.execPath, [expoCli, 'export', '--platform', 'web', '--clear'], {
  stdio: 'inherit',
  env: { ...process.env, ...settings, EXPO_PUBLIC_BUILD: build, EXPO_NO_DOTENV: '1' },
});
if (run.status !== 0) fail('expo export failed (see above).');

// ---------------------------------------------------------------- 2. move package images
const fromDir = join(DIST, 'assets', 'node_modules');
const toDir = join(DIST, 'assets', 'vendor');
if (existsSync(fromDir)) {
  rmSync(toDir, { recursive: true, force: true });
  renameSync(fromDir, toDir);
}

// ---------------------------------------------------------------- 3 and 4. check every file
let rewritten = 0;
const settingsFound = new Set();
for (const file of listFiles(DIST)) {
  if (!TEXT_FILES.has(extname(file))) continue;
  let text = readFileSync(file, 'utf8');
  if (holdsSecretKey(text)) {
    fail(`${file} contains the Supabase secret key. Put the publishable key in ${site.file}.`);
  }
  if (text.includes(otherProject)) fail(`${file} names the other project (${otherProject}). Do not upload dist/.`);
  if (text.includes(FROM)) {
    rewritten += text.split(FROM).length - 1;
    text = text.replaceAll(FROM, TO);
    writeFileSync(file, text);
  }
  // If Expo ever writes these paths differently, the move above would break the images: stop.
  if (text.includes('assets/node_modules')) {
    fail(`${file} still points to assets/node_modules. Check how Expo writes asset paths.`);
  }
  for (const name of SETTING_NAMES) {
    if (text.includes(settings[name])) settingsFound.add(name);
  }
}
for (const name of SETTING_NAMES) {
  if (!settingsFound.has(name)) fail(`${name} from ${site.file} is not in the export. Do not upload dist/.`);
}

// ---------------------------------------------------------------- 5. the QR reader
// The same copies the bundle uses: barcode-detector as expo-camera finds it, zxing-wasm as
// barcode-detector finds it.
const fromCamera = createRequire(require.resolve('expo-camera/package.json'));
const detectorEntry = fromCamera.resolve('barcode-detector/pure');
const detector = await import(pathToFileURL(detectorEntry).href);
const zxingPackage = packageJsonOf(createRequire(detectorEntry).resolve('zxing-wasm/reader'), 'zxing-wasm');
const zxingVersion = JSON.parse(readFileSync(zxingPackage, 'utf8')).version;
if (zxingVersion !== detector.ZXING_WASM_VERSION) {
  fail(`zxing-wasm is ${zxingVersion} but barcode-detector expects ${detector.ZXING_WASM_VERSION}. Run npm ci.`);
}
const wasm = readFileSync(join(dirname(zxingPackage), 'dist', 'reader', 'zxing_reader.wasm'));
const wasmHash = createHash('sha256').update(wasm).digest('hex');
if (wasmHash !== detector.ZXING_WASM_SHA256) {
  fail(`zxing_reader.wasm has SHA-256 ${wasmHash}, not the published ${detector.ZXING_WASM_SHA256}. Run npm ci.`);
}
const wasmDir = join(DIST, 'zxing', zxingVersion);
mkdirSync(wasmDir, { recursive: true });
copyFileSync(join(dirname(zxingPackage), 'dist', 'reader', 'zxing_reader.wasm'), join(wasmDir, 'zxing_reader.wasm'));

// ---------------------------------------------------------------- 6. response headers
// Node reads the TypeScript file directly (type stripping); its one warning about that is muted.
process.removeAllListeners('warning');
const player = await import(pathToFileURL('src/lib/lesson-player-html.ts').href);
if (typeof player.PLAYER_SCRIPT !== 'string') fail('PLAYER_SCRIPT not found in src/lib/lesson-player-html.ts.');
// The hash only fits if the bundle holds exactly this text (Metro writes it as a "..." string).
const bundled = listFiles(DIST)
  .filter((file) => extname(file) === '.js')
  .some((file) => {
    const text = readFileSync(file, 'utf8');
    return text.includes(JSON.stringify(player.PLAYER_SCRIPT)) || text.includes(player.PLAYER_SCRIPT);
  });
if (!bundled) fail('the bundle does not hold PLAYER_SCRIPT word for word, so its CSP hash would not fit. Check how Metro writes it.');
const playerHash = `'sha256-${createHash('sha256').update(player.PLAYER_SCRIPT).digest('base64')}'`;
const headers = readFileSync(join('public', '_headers'), 'utf8')
  .replaceAll('__SUPABASE__', supabaseOrigin)
  .replaceAll('__PLAYER_SCRIPT__', playerHash);
if (/__[A-Z_]+__/.test(headers.replace(/^#.*$/gm, ''))) fail('public/_headers has a placeholder export-web does not know.');
writeFileSync(join(DIST, '_headers'), headers);

// ---------------------------------------------------------------- 7. build id
writeFileSync(
  join(DIST, 'version.txt'),
  `site ${siteName}\ncommit ${commit}${changed ? ' (with uncommitted changes)' : ''}\nbuilt ${build.split(' ')[2]}\nproject ${site.project}\n`,
);

// ---------------------------------------------------------------- 8. single-page fallback
if (existsSync(join(DIST, '404.html'))) {
  console.warn('export-web: dist/404.html exists; Cloudflare Pages will not fall back to index.html.');
}
console.log(`export-web: ${rewritten} asset paths moved to ${TO}; QR reader zxing-wasm ${zxingVersion} copied.`);
if (changed) console.warn('export-web: the folder has uncommitted changes; commit first for a site people use.');
console.log(
  `export-web: dist/ is ready for the ${siteName.toUpperCase()} site: Cloudflare Pages project "${site.host}", ` +
    `Supabase ${site.project}, build ${build}.`,
);
