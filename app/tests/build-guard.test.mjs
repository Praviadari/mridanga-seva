// The APK build guard (scripts/eas-build-guard.mjs, docs/DECISIONS.md #256): EAS Build runs it before
// npm install and it must stop a build whose Supabase settings belong to the other project.
// Run from app/: node --test tests/build-guard.test.mjs

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { BUILD_PROFILES, buildSettingsProblem } from '../scripts/eas-build-guard.mjs';
import { PROJECTS, projectRefOf } from '../scripts/lib/supabase-projects.mjs';

const TEST_URL = `https://${PROJECTS.preview}.supabase.co`;
const LIVE_URL = `https://${PROJECTS.production}.supabase.co`;
// Made-up keys of the right shape; neither opens anything.
const PUBLISHABLE = 'sb_publishable_' + 'x'.repeat(24);
const jwt = (role) => ['e30', Buffer.from(JSON.stringify({ role })).toString('base64url'), 'sig'].join('.');

test('each profile passes only with its own project and a publishable or anon key', () => {
  const ok = { EXPO_PUBLIC_SUPABASE_KEY: PUBLISHABLE };
  assert.equal(buildSettingsProblem({ ...ok, EAS_BUILD_PROFILE: 'preview', EXPO_PUBLIC_SUPABASE_URL: TEST_URL }), null);
  assert.equal(buildSettingsProblem({ ...ok, EAS_BUILD_PROFILE: 'production', EXPO_PUBLIC_SUPABASE_URL: LIVE_URL + '/' }), null);
  assert.equal(
    buildSettingsProblem({ EAS_BUILD_PROFILE: 'preview', EXPO_PUBLIC_SUPABASE_URL: TEST_URL, EXPO_PUBLIC_SUPABASE_KEY: jwt('anon') }),
    null,
  );
  assert.match(buildSettingsProblem({ ...ok, EAS_BUILD_PROFILE: 'production', EXPO_PUBLIC_SUPABASE_URL: TEST_URL }), /must use project qeozvv/);
  assert.match(buildSettingsProblem({ ...ok, EAS_BUILD_PROFILE: 'preview', EXPO_PUBLIC_SUPABASE_URL: LIVE_URL }), /must use project fhuqyk/);
});

test('a missing profile, unknown profile, missing setting, odd URL or secret key stops the build', () => {
  const base = { EAS_BUILD_PROFILE: 'production', EXPO_PUBLIC_SUPABASE_URL: LIVE_URL, EXPO_PUBLIC_SUPABASE_KEY: PUBLISHABLE };
  assert.match(buildSettingsProblem({ ...base, EAS_BUILD_PROFILE: undefined }), /EAS_BUILD_PROFILE is not set/);
  assert.match(buildSettingsProblem({ ...base, EAS_BUILD_PROFILE: 'development' }), /no Supabase project/);
  assert.match(buildSettingsProblem({ ...base, EAS_BUILD_PROFILE: 'toString' }), /no Supabase project/);
  assert.match(buildSettingsProblem({ ...base, EXPO_PUBLIC_SUPABASE_URL: '' }), /URL is missing/);
  assert.match(buildSettingsProblem({ ...base, EXPO_PUBLIC_SUPABASE_URL: LIVE_URL + '.evil.example' }), /not of the form/);
  assert.match(buildSettingsProblem({ ...base, EXPO_PUBLIC_SUPABASE_KEY: '' }), /KEY is missing/);
  assert.match(buildSettingsProblem({ ...base, EXPO_PUBLIC_SUPABASE_KEY: 'sb_secret_' + 'x'.repeat(24) }), /neither a publishable/);
  assert.match(buildSettingsProblem({ ...base, EXPO_PUBLIC_SUPABASE_KEY: jwt('service_role') }), /neither a publishable/);
});

test('facetest (Mridanga Seva TEST, #430) builds only on TEST and only with its variant; the class apps only without one', () => {
  const ok = { EXPO_PUBLIC_SUPABASE_KEY: PUBLISHABLE };
  assert.equal(BUILD_PROFILES.facetest.project, PROJECTS.preview);
  assert.equal(buildSettingsProblem({ ...ok, EAS_BUILD_PROFILE: 'facetest', APP_VARIANT: 'facetest', EXPO_PUBLIC_SUPABASE_URL: TEST_URL }), null);
  assert.match(
    buildSettingsProblem({ ...ok, EAS_BUILD_PROFILE: 'facetest', APP_VARIANT: 'facetest', EXPO_PUBLIC_SUPABASE_URL: LIVE_URL }),
    /must use project fhuqyk/,
  );
  assert.match(buildSettingsProblem({ ...ok, EAS_BUILD_PROFILE: 'facetest', EXPO_PUBLIC_SUPABASE_URL: TEST_URL }), /must be built with APP_VARIANT=facetest/);
  for (const profile of ['preview', 'production']) {
    const url = profile === 'preview' ? TEST_URL : LIVE_URL;
    assert.match(
      buildSettingsProblem({ ...ok, EAS_BUILD_PROFILE: profile, APP_VARIANT: 'facetest', EXPO_PUBLIC_SUPABASE_URL: url }),
      /must be built without APP_VARIANT/,
    );
    assert.equal(buildSettingsProblem({ ...ok, EAS_BUILD_PROFILE: profile, APP_VARIANT: ' ', EXPO_PUBLIC_SUPABASE_URL: url }), null);
  }
  // No profile of the guard may ever point a variant at the live project.
  for (const [name, { project, variant }] of Object.entries(BUILD_PROFILES)) {
    if (variant) assert.notEqual(project, PROJECTS.production, name);
  }
});

test('projectRefOf reads only an exact Supabase address', () => {
  assert.equal(projectRefOf(` ${TEST_URL} `), PROJECTS.preview);
  assert.equal(projectRefOf('http://' + PROJECTS.preview + '.supabase.co'), null);
  assert.equal(projectRefOf(undefined), null);
});

test('run as the hook: exit 1 and no key in the output for the wrong project, exit 0 for the right one', () => {
  const guard = fileURLToPath(new URL('../scripts/eas-build-guard.mjs', import.meta.url));
  const run = (env) => spawnSync(process.execPath, [guard], { encoding: 'utf8', env: { ...process.env, ...env } });
  const wrong = run({ EAS_BUILD_PROFILE: 'production', EXPO_PUBLIC_SUPABASE_URL: TEST_URL, EXPO_PUBLIC_SUPABASE_KEY: PUBLISHABLE });
  assert.equal(wrong.status, 1);
  assert.match(wrong.stderr, /Build stopped/);
  const right = run({ EAS_BUILD_PROFILE: 'production', EXPO_PUBLIC_SUPABASE_URL: LIVE_URL, EXPO_PUBLIC_SUPABASE_KEY: PUBLISHABLE });
  assert.equal(right.status, 0, right.stderr);
  for (const out of [wrong.stdout, wrong.stderr, right.stdout, right.stderr]) assert.ok(!out.includes(PUBLISHABLE));
});
