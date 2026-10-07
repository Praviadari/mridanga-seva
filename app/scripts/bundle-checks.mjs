// Checks shared by scripts/export-web.mjs (the web version) and scripts/publish-update.mjs (updates
// for the Android app): both build a bundle that anyone can download, so both must make sure it
// holds the right Supabase project and never a secret. Uses Node's built-in modules and Expo's own
// .env parser (scripts/lib/env-file.mjs).

import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { parseEnvText } from './lib/env-file.mjs';

/** The two settings every bundle needs. */
export const SETTING_NAMES = ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_KEY'];

/**
 * EXPO_PUBLIC_SUPABASE_URL and _KEY from the text of a .env-style file, as { name: value }, read
 * with Expo's rules (docs/DECISIONS.md #154). Settings that are missing or empty are left out.
 */
export function supabaseSettingsFrom(text) {
  const all = parseEnvText(text);
  const settings = {};
  for (const name of SETTING_NAMES) {
    if (all[name]) settings[name] = all[name];
  }
  return settings;
}

/**
 * What is wrong with the shape of the two settings, or null if nothing is. The URL must be a
 * Supabase project address (project refs are 20 lower-case letters and digits) and the key the
 * publishable one: `sb_publishable_…` or an older JWT with role anon. A value Expo reads
 * differently from what was meant (a stray quote or comment) fails here, before the export.
 */
export function settingsProblem(settings) {
  const url = settings.EXPO_PUBLIC_SUPABASE_URL ?? '';
  const key = settings.EXPO_PUBLIC_SUPABASE_KEY ?? '';
  if (!/^https:\/\/[a-z0-9]{20}\.supabase\.co\/?$/.test(url)) {
    return 'EXPO_PUBLIC_SUPABASE_URL is not of the form https://<project ref>.supabase.co';
  }
  if (!/^sb_publishable_[\w-]{20,}$/.test(key) && jwtRole(key) !== 'anon') {
    return 'EXPO_PUBLIC_SUPABASE_KEY is neither a publishable key (sb_publishable_…) nor an anon JWT';
  }
  return null;
}

/** Every file below `dir`, as paths that include `dir`. */
export function listFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

/** The `role` claim of a JWT, or null if `token` is not one. */
function jwtRole(token) {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')).role ?? null;
  } catch {
    return null;
  }
}

/**
 * Shapes of secrets that must never be in a bundle (docs/DECISIONS.md #155). Each has a fixed
 * prefix or framing, so ordinary code does not look like one. Not covered: secrets without a
 * recognisable shape (an Expo access token, a database password on its own); those must never be
 * put in an EXPO_PUBLIC_ variable in the first place.
 */
const SECRET_SHAPES = [
  ['a Supabase personal access token (sbp_)', /sbp_[0-9a-f]{40}/],
  ['a private key (PEM)', /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----/],
  ['a Postgres address with a password', /postgres(?:ql)?:\/\/[^\s:/@'"`]+:[^\s@/'"`]+@/],
  ['a Google API key (AIza)', /AIza[\w-]{35}/],
  ['a GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{36}|github_pat_\w{60,})/],
  ['a Slack token or webhook', /\bxox[abposr]-[A-Za-z0-9-]{10,}|hooks\.slack\.com\/services\/T\w+\/B\w+\/\w+/],
  ['an AWS access key', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  [
    'a named token or password with a value',
    /\b(?:EXPO_TOKEN|SUPABASE_ACCESS_TOKEN|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_DB_PASSWORD|SERVICE_ROLE_KEY)['"]?\s*[:=]\s*['"]?[\w.-]{20,}/,
  ],
];

/**
 * The kind of secret `text` holds, or null. Looks for a Supabase secret key (the new sb_secret_
 * form, or an old JWT whose role is service_role or supabase_admin) and the other SECRET_SHAPES.
 *
 * A bare 'sb_secret_' is not enough: the app's own check for the key contains those words
 * (src/lib/supabase.ts). With `bytecode` (Hermes .hbc files) the strings sit end to end, so that
 * literal runs straight into the next string ('sb_secret__getObserver…', seen 07-10-2026). There a
 * key is assumed when 'sb_secret_' occurs more than once (the app has the literal once), or is
 * followed by 31 or more key characters that include a digit (real keys are random; the strings
 * that follow in the bytecode are names). Whoever checks bytecode must still check the key setting
 * itself before the export.
 */
export function secretIn(text, { bytecode = false } = {}) {
  if (bytecode) {
    const runs = [...text.matchAll(/sb_secret_([\w-]*)/g)];
    if (runs.length > 1 || runs.some(([, rest]) => rest.length >= 31 && /\d/.test(rest))) {
      return 'a Supabase secret key (sb_secret_)';
    }
  } else if (/sb_secret_[\w-]{16,}/.test(text)) {
    return 'a Supabase secret key (sb_secret_)';
  }
  for (const [token] of text.matchAll(/eyJ[\w-]+\.eyJ[\w-]+\.[\w-]+/g)) {
    const role = jwtRole(token);
    if (role === 'service_role' || role === 'supabase_admin') return `a Supabase ${role} key (JWT)`;
  }
  for (const [kind, shape] of SECRET_SHAPES) {
    if (shape.test(text)) return kind;
  }
  return null;
}

/** True if `text` holds a secret (see secretIn). */
export function holdsSecretKey(text, options) {
  return secretIn(text, options) !== null;
}
