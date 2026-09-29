// Builds the web version into dist/, ready to upload to the web host
// (docs/OPERATIONS.md "Publishing the web version"). Run from app/:
//   npm run export:web                      live site: Supabase settings from app/.env
//   npm run export:web -- --env .env.test   test site: settings from app/.env.test
//
// 1. Reads EXPO_PUBLIC_SUPABASE_URL and _KEY from the chosen file and hands them to
//    `expo export --platform web --clear`. Values already in the environment win over .env
//    files, and --clear stops Metro's cache from keeping an older value (seen 29-09-2026: the
//    cache kept an empty key and the site said "App not set up").
// 2. Moves dist/assets/node_modules to dist/assets/vendor and rewrites the paths in the
//    exported files. Expo puts images that come from packages (the header back arrow, for
//    example) under a folder named node_modules, and Cloudflare Pages never uploads a folder
//    with that name, so those images would be missing on the live site.
// 3. Refuses to finish if the export holds the Supabase secret (service_role) key. Everything
//    in EXPO_PUBLIC_* is readable by anyone who opens the site, and that key bypasses every
//    access rule. The app itself also refuses to start with it (src/lib/supabase.ts).
// 4. Checks that the export holds exactly the URL and key from the chosen file, so a test
//    site never talks to the live project or the other way round.
// 5. Warns if dist/404.html exists: Cloudflare Pages then stops sending every address to
//    index.html, which this single-page app needs (docs/DECISIONS.md #15).
//
// Uses only Node's built-in modules. Exits with code 1 if dist/ must not be uploaded.

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { extname, join } from 'node:path';

const DIST = 'dist';
const FROM = '/assets/node_modules/';
const TO = '/assets/vendor/';
/** Files that can hold paths to assets. Images are left alone. */
const TEXT_FILES = new Set(['.js', '.html', '.css', '.json', '.map']);
const SETTING_NAMES = ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_KEY'];

/** Stops the script with a message and exit code 1. */
function fail(message) {
  console.error('export-web: ' + message);
  process.exit(1);
}

/** The env file named after --env, or '.env'. */
function envFileFromArgs(args) {
  const i = args.indexOf('--env');
  if (i === -1) return '.env';
  if (!args[i + 1]) fail('--env needs a file name, for example --env .env.test');
  return args[i + 1];
}

/** EXPO_PUBLIC_SUPABASE_URL and _KEY from a .env-style file, as { name: value }. */
function readSettings(file) {
  if (!existsSync(file)) fail(`${file} not found in app/. Copy .env.example and fill it in.`);
  const settings = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*(EXPO_PUBLIC_SUPABASE_(?:URL|KEY))\s*=\s*(.*?)\s*$/);
    if (match) settings[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  for (const name of SETTING_NAMES) {
    if (!settings[name]) fail(`${name} is missing or empty in ${file}.`);
  }
  return settings;
}

/** Every file below `dir`, as paths that include `dir`. */
function listFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

/**
 * True if `text` holds a secret key: the new sb_secret_ form or an old service_role JWT.
 * A bare 'sb_secret_' is not enough: the app's own check for the key contains those words.
 */
function holdsSecretKey(text) {
  if (/sb_secret_[\w-]{16,}/.test(text)) return true;
  for (const [token] of text.matchAll(/eyJ[\w-]+\.(eyJ[\w-]+)\.[\w-]+/g)) {
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
      if (payload.role === 'service_role') return true;
    } catch {
      // Not a JWT after all; ignore it.
    }
  }
  return false;
}

// ---------------------------------------------------------------- 1. export
const envFile = envFileFromArgs(process.argv.slice(2));
const settings = readSettings(envFile);
console.log(`export-web: building for ${settings.EXPO_PUBLIC_SUPABASE_URL} (from ${envFile})`);

// Run Expo's own CLI with this Node, so no shell is needed on Windows.
const expoCli = createRequire(import.meta.url).resolve('expo/bin/cli');
const run = spawnSync(process.execPath, [expoCli, 'export', '--platform', 'web', '--clear'], {
  stdio: 'inherit',
  env: { ...process.env, ...settings },
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
    fail(`${file} contains the Supabase secret key. Put the publishable key in ${envFile}.`);
  }
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
  if (!settingsFound.has(name)) fail(`${name} from ${envFile} is not in the export. Do not upload dist/.`);
}

// ---------------------------------------------------------------- 5. single-page fallback
if (existsSync(join(DIST, '404.html'))) {
  console.warn('export-web: dist/404.html exists; Cloudflare Pages will not fall back to index.html.');
}
console.log(`export-web: ${rewritten} asset paths moved to ${TO}. dist/ is ready to upload.`);
