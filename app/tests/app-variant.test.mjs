// App variants (app.config.js, docs/DECISIONS.md #430): without APP_VARIANT the class's app is exactly app.json, and
// the class's EAS profiles are exactly what they were before the face-scan test app; APP_VARIANT=facetest is
// "Mridanga Seva TEST" with its own package, scheme and icons, on the TEST project.
// Run from app/: node --test tests/app-variant.test.mjs

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const appConfig = require('../app.config.js');
const appJson = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8'));
const easJson = JSON.parse(readFileSync(new URL('../eas.json', import.meta.url), 'utf8'));

/** app.config.js's answer for app.json with APP_VARIANT set to `variant` (undefined = not set). */
function configFor(variant) {
  const before = process.env.APP_VARIANT;
  if (variant === undefined) delete process.env.APP_VARIANT;
  else process.env.APP_VARIANT = variant;
  try {
    return appConfig({ config: structuredClone(appJson.expo) });
  } finally {
    if (before === undefined) delete process.env.APP_VARIANT;
    else process.env.APP_VARIANT = before;
  }
}

test('without APP_VARIANT the config is app.json, unchanged (production and preview APKs, their updates)', () => {
  assert.deepEqual(configFor(undefined), appJson.expo);
  assert.deepEqual(configFor(''), appJson.expo);
});

test('APP_VARIANT=facetest changes only the name, package, scheme, icons and the google-services file', () => {
  const facetest = configFor('facetest');
  assert.equal(facetest.name, 'Mridanga Seva TEST');
  assert.equal(facetest.android.package, 'org.mridangaseva.app.test');
  assert.equal(facetest.scheme, 'mridangasevatest');
  assert.equal(facetest.android.googleServicesFile, undefined);
  for (const file of [facetest.icon, facetest.android.adaptiveIcon.foregroundImage, facetest.android.adaptiveIcon.monochromeImage]) {
    assert.match(file, /^\.\/assets\/images\/facetest\//);
    assert.ok(existsSync(new URL(`../${file.slice(2)}`, import.meta.url)), file);
  }
  const strip = (c) => {
    const copy = structuredClone(c);
    for (const key of ['name', 'scheme', 'icon']) delete copy[key];
    for (const key of ['package', 'googleServicesFile', 'adaptiveIcon']) delete copy.android[key];
    return copy;
  };
  assert.deepEqual(strip(facetest), strip(appJson.expo));
  assert.equal(facetest.android.adaptiveIcon.backgroundImage, appJson.expo.android.adaptiveIcon.backgroundImage);
  // The class's app.json is not touched by building the variant.
  assert.equal(appJson.expo.android.package, 'org.mridangaseva.app');
});

test('an unknown APP_VARIANT stops the build instead of building the class app under a wrong name', () => {
  assert.throws(() => configFor('facetes'), /not a variant of this app/);
});

test('eas.json: preview and production are as before; facetest is an APK on its own channel with its variant', () => {
  assert.deepEqual(easJson.build.preview, {
    distribution: 'internal',
    environment: 'preview',
    autoIncrement: true,
    android: { buildType: 'apk' },
    channel: 'preview',
  });
  assert.deepEqual(easJson.build.production, {
    distribution: 'internal',
    environment: 'production',
    autoIncrement: true,
    android: { buildType: 'apk' },
    channel: 'production',
  });
  assert.deepEqual(easJson.build.facetest, {
    distribution: 'internal',
    // The TEST values live in EAS's "preview" environment; the build guard maps facetest to TEST only.
    environment: 'preview',
    autoIncrement: true,
    env: { APP_VARIANT: 'facetest' },
    android: { buildType: 'apk' },
    channel: 'facetest',
  });
});
