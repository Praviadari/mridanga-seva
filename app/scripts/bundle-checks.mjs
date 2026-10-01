// Checks shared by scripts/export-web.mjs (the web version) and scripts/publish-update.mjs (updates
// for the Android app): both build a bundle that anyone can download, so both must make sure it
// holds the right Supabase project and never the secret key. Uses only Node's built-in modules.

import { readdirSync } from 'node:fs';
import { join } from 'node:path';

/** The two settings every bundle needs. */
export const SETTING_NAMES = ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_KEY'];

/**
 * EXPO_PUBLIC_SUPABASE_URL and _KEY from the text of a .env-style file, as { name: value }.
 * Settings that are missing are left out; quotes around a value are removed.
 */
export function supabaseSettingsFrom(text) {
  const settings = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*(EXPO_PUBLIC_SUPABASE_(?:URL|KEY))\s*=\s*(.*?)\s*$/);
    if (match) settings[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return settings;
}

/** Every file below `dir`, as paths that include `dir`. */
export function listFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

/**
 * True if `text` holds a secret key: the new sb_secret_ form or an old service_role JWT.
 * A bare 'sb_secret_' is not enough: the app's own check for the key contains those words.
 * With `bytecode` (Hermes .hbc files) only JWTs are looked for: there the strings sit end to end,
 * so the app's 'sb_secret_' runs straight into the next string and looks like a key (seen
 * 01-10-2026). Whoever checks bytecode must check the key setting itself before the export.
 */
export function holdsSecretKey(text, { bytecode = false } = {}) {
  if (!bytecode && /sb_secret_[\w-]{16,}/.test(text)) return true;
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
