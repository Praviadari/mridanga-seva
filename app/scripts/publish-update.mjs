// Publishes an over-the-air update to the Android app (docs/DECISIONS.md #35, docs/OPERATIONS.md
// "Updating the Android app"). Run from app/:
//   npm run update:preview -- --message "Clearer follow-up card"     test project: testers' APKs
//   npm run update:production -- --message "Clearer follow-up card"  live project: the class
// Add --check-only to run every check below without publishing.
//
// An update bundle carries EXPO_PUBLIC_SUPABASE_URL and _KEY inside it, like an APK does. A
// preview update made with the live settings would send testers into the class's real data, and
// a production update made with the test settings would cut the class off from it. So the bundle
// never reads app/.env or app/.env.test. First it checks the network can upload to EAS (see below).
// 0. Computes the app's fingerprint (its runtime version) and looks for a finished APK on this
//    channel with the same one. None means the change touched something native: phones would
//    never get this update, and a new APK is needed instead (OPERATIONS.md lists what counts).
// 1. Pulls the channel's settings from the EAS environment of the same name (`eas env:pull`):
//    the values the APKs on that channel were built with. They go to a temporary file, deleted
//    straight after, also when reading it fails or the script is stopped with Ctrl+C. The file is
//    read with Expo's own .env rules (scripts/lib/env-file.mjs).
// 2. Checks that the URL names the project this channel belongs to (PROJECTS), that both
//    settings have the right shape, and that the key is not the secret one.
// 3. Exports the Android bundle into dist-update/ with `expo export --clear` and those values in
//    the environment. Values already in the environment win over .env files, and --clear stops
//    Metro's cache from keeping older ones (the same trap as scripts/export-web.mjs).
// 4. Checks the bundle: it holds this channel's URL and key, not the other project's address,
//    and no secret (scripts/bundle-checks.mjs lists the shapes).
// 5. Asks once more, for preview as for production: type yes (docs/DECISIONS.md #152). Then
//    publishes with `eas update --skip-bundler --channel <channel> --environment <channel>`.
//
// EAS CLI is the copy pinned in package.json (devDependencies), never a download of the newest
// one (docs/DECISIONS.md #153). Needs the Expo login on this computer (`npx eas-cli login`).
// Exits with code 1 and publishes nothing if any check fails or the answer is not yes.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, extname, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { connect } from 'node:tls';

import { listFiles, secretIn, SETTING_NAMES, settingsProblem, supabaseSettingsFrom } from './bundle-checks.mjs';

const OUT = 'dist-update';

/**
 * Supabase project of each channel. A channel's APKs and updates must always use the same one:
 * `preview` = the test project (dummy data), `production` = the live project. Change these only
 * together with the EAS environments (docs/OPERATIONS.md "Building the Android app").
 */
const PROJECTS = {
  preview: 'fhuqykssenuhczdqbafu',
  production: 'qeozvvizcojzxcjgnaei',
};

/** Files of the bundle that can hold the settings. Android bundles are Hermes bytecode (.hbc). */
const BUNDLE_FILES = new Set(['.hbc', '.js', '.json', '.map']);

/** Stops the script with a message and exit code 1. */
function fail(message) {
  console.error('publish-update: ' + message);
  process.exit(1);
}

/** The value after `--name` (or its short form) in `args`, or undefined. */
function argValue(args, ...names) {
  const i = args.findIndex((arg) => names.includes(arg));
  return i === -1 ? undefined : args[i + 1];
}

/**
 * Runs the pinned EAS CLI (node_modules/eas-cli) with `args`, with this Node and no shell, so the
 * arguments arrive as they are. Returns true if it succeeded. With `capture`, returns its standard
 * output instead (null if it failed); messages on standard error still show.
 */
function eas(args, { capture = false } = {}) {
  const run = spawnSync(process.execPath, [easCli, ...args], {
    stdio: capture ? ['inherit', 'pipe', 'inherit'] : 'inherit',
    encoding: 'utf8',
  });
  if (capture) return run.status === 0 ? run.stdout : null;
  return run.status === 0;
}

/**
 * Asks `question` and returns true only if the answer is yes. No answer (no keyboard attached,
 * end of input, Ctrl+C) counts as no.
 */
async function confirmed(question) {
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  const closed = new Promise((resolve) => prompt.once('close', () => resolve('')));
  prompt.once('SIGINT', () => prompt.close());
  const answer = await Promise.race([prompt.question(question).catch(() => ''), closed]);
  prompt.close();
  return answer.trim().toLowerCase() === 'yes';
}

/** The first JSON value in `text` (EAS CLI and expo-updates may print lines before it), or null. */
function jsonIn(text) {
  const start = text.search(/[[{]/);
  if (start === -1) return null;
  try {
    return JSON.parse(text.slice(start));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- arguments
const args = process.argv.slice(2);
const channel = args[0];
if (!(channel in PROJECTS)) fail('first argument must be preview or production.');
const message = argValue(args, '--message', '-m');
if (!message) fail('say what changed: --message "Clearer follow-up card".');
// One plain line, as it shows in `eas update:list`: no quotes, %, $, backticks, backslashes or
// line breaks (once needed because the message went through a shell; kept so the rule stays the same).
if (!/^[^"%$`\\\r\n]{1,200}$/.test(message)) {
  fail('the message may not contain " % $ ` \\ or line breaks, and at most 200 characters.');
}
const project = PROJECTS[channel];
const otherProject = Object.values(PROJECTS).find((ref) => ref !== project);
const require = createRequire(import.meta.url);
/** The pinned EAS CLI's entry point (package.json devDependencies "eas-cli"). */
const easCli = join(dirname(require.resolve('eas-cli/package.json')), 'bin', 'run');
if (!existsSync(easCli)) fail('EAS CLI is not installed in app/node_modules. Run npm ci in app/ first.');

// ---------------------------------------------------------------- network
// EAS keeps uploads on Google's storage. A network that inspects secure connections (the office
// FortiGate, 1 Oct 2026) breaks the upload halfway with "unable to verify the first certificate",
// after a minute of bundling. Ask once, with checks on, before doing anything else. Not with
// --check-only, which uploads nothing and so works on any network.
const checkOnly = args.includes('--check-only');
const storageReachable = checkOnly || await new Promise((resolve) => {
  const socket = connect({ host: 'storage.googleapis.com', port: 443, servername: 'storage.googleapis.com' }, () => {
    socket.end();
    resolve(true);
  });
  socket.setTimeout(15000, () => socket.destroy(new Error('timeout')));
  socket.on('error', () => resolve(false));
});
if (!storageReachable) {
  fail(
    'cannot reach storage.googleapis.com with a trusted certificate. This network probably inspects secure ' +
      'connections (the office network does). Use another one, such as a phone hotspot, and try again.',
  );
}

// ---------------------------------------------------------------- 0. an APK that can take it
const resolved = spawnSync(
  process.execPath,
  [require.resolve('expo-updates/bin/cli'), 'runtimeversion:resolve', '--platform', 'android'],
  { stdio: ['inherit', 'pipe', 'inherit'], encoding: 'utf8' },
);
const runtimeVersion = resolved.status === 0 ? jsonIn(resolved.stdout)?.runtimeVersion : undefined;
if (!runtimeVersion) fail('could not compute the app fingerprint (see above).');
const builds = jsonIn(
  eas(
    [
      'build:list', '--platform', 'android', '--status', 'finished', '--channel', channel,
      '--runtime-version', runtimeVersion, '--limit', '1', '--json', '--non-interactive',
    ],
    { capture: true },
  ) ?? '',
);
if (!Array.isArray(builds)) fail('could not list the builds on EAS (logged in? npx eas-cli whoami).');
if (builds.length === 0) {
  fail(
    `no finished ${channel} APK has fingerprint ${runtimeVersion}. Something native changed since ` +
      `the last APK, so no phone would get this update. Build a new APK instead: ` +
      `npx eas-cli build -p android --profile ${channel} (OPERATIONS.md "Updating the Android app").`,
  );
}
console.log(`publish-update: fingerprint ${runtimeVersion} matches APK build ${builds[0].id}.`);

// ---------------------------------------------------------------- 1 and 2. settings from EAS
// The pulled file is deleted whatever happens: in `finally`, on any exit, and on Ctrl+C (Node
// runs the handler once EAS CLI has stopped). Only public values belong in these environments,
// but a secret added there later must not be left behind in the temp folder (audit D11-19).
const envFile = join(tmpdir(), `mridanga-seva-${channel}-${process.pid}.env`);
const removeEnvFile = () => rmSync(envFile, { force: true });
const stopped = () => {
  removeEnvFile();
  process.exit(130);
};
process.once('exit', removeEnvFile);
process.once('SIGINT', stopped);
let pulledText = null;
try {
  if (eas(['env:pull', '--environment', channel, '--path', envFile, '--non-interactive']) && existsSync(envFile)) {
    pulledText = readFileSync(envFile, 'utf8');
  }
} finally {
  removeEnvFile();
  process.off('SIGINT', stopped);
}
if (pulledText === null) {
  fail(`could not read the "${channel}" environment from EAS (logged in? npx eas-cli whoami).`);
}
const settings = supabaseSettingsFrom(pulledText);
for (const name of SETTING_NAMES) {
  if (!settings[name]) fail(`${name} is missing in the "${channel}" environment on EAS (OPERATIONS.md: env:push).`);
}
if (!settings.EXPO_PUBLIC_SUPABASE_URL.includes(project)) {
  fail(`the "${channel}" environment on EAS points to ${settings.EXPO_PUBLIC_SUPABASE_URL}, not project ${project}. Fix it with env:push first.`);
}
// Checked here as well as in the bundle, because inside Hermes bytecode a secret key is harder to
// recognise (scripts/bundle-checks.mjs).
const secretSetting = secretIn(settings.EXPO_PUBLIC_SUPABASE_KEY);
if (secretSetting) {
  fail(`the "${channel}" environment on EAS holds ${secretSetting}. Push the publishable key (OPERATIONS.md "If a key leaks").`);
}
const problem = settingsProblem(settings);
if (problem) fail(`the "${channel}" environment on EAS: ${problem}. Fix it with env:push first.`);
console.log(`publish-update: ${channel} → ${settings.EXPO_PUBLIC_SUPABASE_URL}`);

// ---------------------------------------------------------------- 3. export
rmSync(OUT, { recursive: true, force: true });
const expoCli = require.resolve('expo/bin/cli');
const run = spawnSync(
  process.execPath,
  [expoCli, 'export', '--platform', 'android', '--output-dir', OUT, '--dump-assetmap', '--clear'],
  // EXPO_NO_DOTENV: Expo itself loads no .env file into the bundle (audit D11-08).
  { stdio: 'inherit', env: { ...process.env, ...settings, EXPO_NO_DOTENV: '1' } },
);
if (run.status !== 0) fail('expo export failed (see above).');

// ---------------------------------------------------------------- 4. check the bundle
if (!existsSync(join(OUT, 'metadata.json'))) fail(`${OUT}/metadata.json is missing; the export did not finish.`);
const found = new Set();
for (const file of listFiles(OUT)) {
  if (!BUNDLE_FILES.has(extname(file))) continue;
  // latin1 keeps every byte, so the ASCII settings are found inside Hermes bytecode too.
  const text = readFileSync(file, 'latin1');
  const secret = secretIn(text, { bytecode: extname(file) === '.hbc' });
  if (secret) fail(`${file} contains ${secret}. Nothing was published.`);
  if (text.includes(otherProject)) fail(`${file} names the other project (${otherProject}). Nothing was published.`);
  for (const name of SETTING_NAMES) {
    if (text.includes(settings[name])) found.add(name);
  }
}
for (const name of SETTING_NAMES) {
  if (!found.has(name)) fail(`${name} of the "${channel}" environment is not in the bundle. Nothing was published.`);
}
console.log(`publish-update: bundle checked: ${project} only, no secret.`);
if (checkOnly) {
  console.log('publish-update: --check-only, so nothing was published.');
  process.exit(0);
}

// ---------------------------------------------------------------- 5. publish
// Both channels ask (docs/DECISIONS.md #152): two preview updates went out by accident when
// only production asked. There is no flag to skip the question; nothing is published without it.
const question =
  channel === 'production'
    ? 'Publish to the LIVE app used by the class? Type yes: '
    : 'Publish to the TEST app on the testers\' phones (preview)? Type yes: ';
if (!(await confirmed(question))) fail('not published.');
const published = eas([
  'update',
  '--skip-bundler',
  '--input-dir', OUT,
  '--platform', 'android',
  '--channel', channel,
  '--environment', channel,
  '--message', message,
  '--non-interactive',
]);
if (!published) fail('eas update failed (see above).');
console.log(
  `publish-update: published to ${channel}. A phone downloads it the next time the app starts or ` +
    'comes back to the front, then its home screen offers Restart.',
);
