// Unit tests for the app-size cuts of 26-10-2026 (docs/DECISIONS.md #618-#619, NOTES_app_size.md): expo-symbols swapped
// for a stand-in on Android only (its Material Symbols font left the APK and the updates), and over-the-air updates
// exported with source maps (Hermes keeps its debug tables out of the bytecode), the maps moved out of the update
// before it is checked. Run from app/: npm test.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

/** The resolveRequest of metro.config.js, called with a stand-in context that records what it hands on. */
function resolveWith(moduleName, platform) {
  const config = require('../metro.config.js');
  const context = { resolveRequest: (_ctx, name, plat) => ({ type: 'passed-on', name, plat }) };
  return config.resolver.resolveRequest(context, moduleName, platform);
}

test('metro.config.js: expo-symbols is the stand-in on Android only', () => {
  const android = resolveWith('expo-symbols', 'android');
  assert.equal(android.type, 'sourceFile');
  assert.ok(existsSync(android.filePath), `${android.filePath} exists`);
  assert.match(android.filePath.replace(/\\/g, '/'), /src\/lib\/expo-symbols-stub\.tsx$/);
  for (const platform of ['web', 'ios', null]) {
    assert.deepEqual(resolveWith('expo-symbols', platform), { type: 'passed-on', name: 'expo-symbols', plat: platform });
  }
  assert.deepEqual(resolveWith('expo-router', 'android'), { type: 'passed-on', name: 'expo-router', plat: 'android' });
});

test('the stand-in exports every name of expo-symbols that the app bundle reaches', () => {
  const stub = read('src/lib/expo-symbols-stub.tsx');
  const real = read('node_modules/expo-symbols/build/index.js');
  const names = [...real.matchAll(/export \{ (\w+) \}/g)].map((m) => m[1]);
  assert.ok(names.length >= 2, 'expo-symbols still exports its names as before');
  for (const name of names) assert.match(stub, new RegExp(`export function ${name}\\(`), name);
  // expo-router's Android icon converter is the only path that reaches it (no screen imports expo-symbols).
  const converter = read('node_modules/expo-router/build/native-tabs/utils/materialIconConverter.android.js');
  for (const [, name] of converter.matchAll(/expo_symbols_1\.(\w+)/g)) assert.ok(names.includes(name), name);
});

test('publish-update exports with source maps and moves them out before the checks and the upload', () => {
  const script = read('scripts/publish-update.mjs');
  const exportLine = script.match(/\[expoCli, 'export'[^\]]*\]/)?.[0] ?? '';
  assert.match(exportLine, /'--source-maps'/);
  const moved = script.indexOf('renameSync(file, target)');
  assert.ok(moved > script.indexOf("[expoCli, 'export'"), 'maps are moved after the export');
  assert.ok(moved < script.indexOf('// ---------------------------------------------------------------- 4. check'), 'and before the checks');
  const publishArgs = script.match(/eas\(\[\s*'update',[^\]]*\]/)?.[0] ?? '';
  assert.match(publishArgs, /'--skip-bundler'/);
  assert.doesNotMatch(publishArgs, /source-maps/);
  assert.match(read('.gitignore'), /^dist-update-maps\/$/m);
});
