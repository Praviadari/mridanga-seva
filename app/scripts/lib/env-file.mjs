// Reads a .env-style file exactly the way Expo does (docs/DECISIONS.md #154). The release scripts
// hand the Supabase settings to `expo export` themselves and then look for them in the bundle; if
// they read a line differently from Expo (an inline comment, quotes, `export`, CRLF), a bundle
// that cannot reach Supabase would pass every check (audit D11-07). So instead of a parser of our
// own, this uses Expo's: `parseEnv` of @expo/env, the package `expo export` loads .env files with.
// It is resolved from the `expo` package, so it is always the copy that Expo itself runs.

import { createRequire } from 'node:module';
import { dirname } from 'node:path';

const require = createRequire(import.meta.url);
const expoDir = dirname(require.resolve('expo/package.json'));
const { parseEnv } = require(require.resolve('@expo/env', { paths: [expoDir] }));

/**
 * The variables in the text of a .env-style file, as { name: value }. Same rules as Expo: Node's
 * util.parseEnv (quotes, `export`, `#` comments, CRLF), then `${VAR}` expansion against the
 * environment, and Expo's blocked names (NODE_ENV and the like) left out.
 */
export function parseEnvText(text) {
  return parseEnv(text, process.env);
}
