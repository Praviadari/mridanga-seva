// Settings for the E2E tests (e2e/README.md). Two files, both gitignored:
//   app/.env.test  the TEST project's URL and publishable key (the same file the TEST site is built from)
//   e2e/.env.e2e   the E2E logins (npm run e2e:env writes it; keys in e2e/.env.e2e.example)
// Everything stops unless the URL names the TEST project: these tests sign in, register a student and
// write practice and check-ins, so they must never reach the LIVE project.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const E2E_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const APP_DIR = join(E2E_DIR, '..', 'app');
export const DIST_DIR = join(APP_DIR, 'dist');
export const ENV_FILE = join(E2E_DIR, '.env.e2e');

export const TEST_PROJECT = 'fhuqykssenuhczdqbafu';
export const LIVE_PROJECT = 'qeozvvizcojzxcjgnaei';

/** The logins the tests use. TOTP secrets are optional (npm run e2e:code fills the coordinator's). */
export const LOGIN_KEYS = [
  'E2E_STUDENT_EMAIL',
  'E2E_STUDENT_PASSWORD',
  'E2E_COORDINATOR_EMAIL',
  'E2E_COORDINATOR_PASSWORD',
  'E2E_GURU_EMAIL',
  'E2E_GURU_PASSWORD',
];
export const OPTIONAL_KEYS = ['E2E_COORDINATOR_TOTP_SECRET', 'E2E_GURU_TOTP_SECRET', 'E2E_PORT'];

/** KEY=value lines; # comments and blank lines skipped, surrounding quotes removed. */
export function parseEnv(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    let value = line.slice(eq + 1).trim();
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
    out[line.slice(0, eq).trim()] = value;
  }
  return out;
}

/** Replaces (or adds) one KEY=value line, keeping every other line as it was. */
export function setEnvValue(text, key, value) {
  const lines = text.split(/\r?\n/);
  const i = lines.findIndex((l) => l.trim().startsWith(key + '='));
  if (i === -1) {
    if (lines.length && lines[lines.length - 1] === '') lines.pop();
    lines.push(`${key}=${value}`, '');
  } else {
    lines[i] = `${key}=${value}`;
  }
  return lines.join('\n');
}

/** The TEST project's URL and key from app/.env.test; stops on anything but the TEST project. */
export function testProject() {
  const file = join(APP_DIR, '.env.test');
  if (!existsSync(file)) throw new Error('app/.env.test is missing: copy it from the main folder (TEST values only).');
  const env = parseEnv(readFileSync(file, 'utf8'));
  const url = env.EXPO_PUBLIC_SUPABASE_URL ?? '';
  const key = env.EXPO_PUBLIC_SUPABASE_KEY ?? '';
  if (!url.includes(TEST_PROJECT) || url.includes(LIVE_PROJECT)) {
    throw new Error('app/.env.test does not name the TEST project; the E2E tests only ever run on TEST.');
  }
  if (!key.startsWith('sb_publishable_')) throw new Error('app/.env.test must hold the publishable key, nothing else.');
  return { url, key };
}

/** The E2E logins from e2e/.env.e2e; stops with the missing keys named (never their values). */
export function e2eLogins() {
  if (!existsSync(ENV_FILE)) throw new Error('e2e/.env.e2e is missing: run npm run e2e:env, then see README "One-time set-up".');
  const env = parseEnv(readFileSync(ENV_FILE, 'utf8'));
  const missing = LOGIN_KEYS.filter((k) => !env[k]);
  if (missing.length) throw new Error('e2e/.env.e2e lacks ' + missing.join(', '));
  for (const k of LOGIN_KEYS.filter((k) => k.endsWith('_EMAIL'))) {
    if (!/^e2e\.[a-z]+@example\.com$/i.test(env[k])) {
      throw new Error(`${k} must be an e2e.<role>@example.com address, so E2E logins are never real people.`);
    }
  }
  return env;
}

export function writeEnvFile(text) {
  writeFileSync(ENV_FILE, text, 'utf8');
}
