// Unit tests for ML Kit from Google Play services (docs/DECISIONS.md #630, plugins/with-mlkit-play-services.js): the
// bundled ML Kit artifacts the camera libraries ask for are swapped for their Play services twins in the app's Gradle
// build, and the app's manifest asks Play services for every model it uses. The size it saves and the phone test are in
// NOTES_app_size.md. Run from app/: npm test.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const plugin = require('../plugins/with-mlkit-play-services.js');

test('app.json runs the plugin', () => {
  const { expo } = JSON.parse(read('app.json'));
  assert.ok(expo.plugins.includes('./plugins/with-mlkit-play-services'));
});

test('every bundled ML Kit artifact a camera library asks for has a Play services twin', () => {
  const asked = [
    ...read('node_modules/expo-camera/android/build.gradle').matchAll(/"(com\.google\.mlkit:[\w-]+):[\d.]+"/g),
    ...read('node_modules/react-native-vision-camera-face-detector/android/build.gradle').matchAll(
      /"(com\.google\.mlkit:[\w-]+):[\d.]+"/g,
    ),
  ].map((m) => m[1]);
  assert.deepEqual([...new Set(asked)].sort(), Object.keys(plugin.SUBSTITUTES).sort());
  for (const to of Object.values(plugin.SUBSTITUTES)) assert.match(to, /^com\.google\.android\.gms:play-services-mlkit-[\w-]+:\d+\.\d+\.\d+$/);
});

test('the Gradle block substitutes each artifact once', () => {
  const block = plugin.gradleBlock();
  for (const [from, to] of Object.entries(plugin.SUBSTITUTES)) {
    assert.equal(block.split(`substitute module('${from}') using module('${to}')`).length, 2, from);
  }
  assert.match(block, /^configurations\.all \{$/m);
});

test('the manifest keeps expo-camera\'s scanner model and adds barcode and face', () => {
  const library = read('node_modules/expo-camera/android/src/main/AndroidManifest.xml');
  const own = /com\.google\.mlkit\.vision\.DEPENDENCIES"\s+android:value="([^"]+)"/.exec(library)?.[1];
  const source = read('plugins/with-mlkit-play-services.js');
  const models = /const MODELS = '([^']+)'/.exec(source)?.[1].split(',') ?? [];
  for (const name of [...(own ?? '').split(','), 'barcode', 'face']) assert.ok(models.includes(name), name);
  assert.match(source, /'tools:replace'\] = 'android:value'/);
});
