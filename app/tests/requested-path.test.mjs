// Unit tests for src/auth/requested-path.ts: which screen a link asked for, kept without its query
// or '#' part (password-reset tokens), and opened only in the area it belongs to (audit D14-15,
// docs/DECISIONS.md #30, #36). react-native and expo-linking are replaced by small stubs
// (tests/stubs/), so the file runs under Node's own test runner on a web start and a phone start.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import './stubs/register.mjs';

/** Loads a fresh copy of the module as if the app had just started on `os`. */
async function startApp(os, { pathname = '/', initialUrl = null } = {}) {
  globalThis.__testOS = os;
  globalThis.__testInitialUrl = initialUrl;
  globalThis.window = os === 'web' ? { location: { pathname } } : undefined;
  const mod = await import(`../src/auth/requested-path.ts?start=${Math.random()}`);
  await new Promise((resolve) => setImmediate(resolve)); // getInitialURL() answers asynchronously
  return mod;
}

test('belongsTo: each area opens only its own screens', async () => {
  const { belongsTo } = await startApp('web');
  assert.equal(belongsTo('/student', 'student'), true);
  assert.equal(belongsTo('/student/announcements/12', 'student'), true);
  assert.equal(belongsTo('/students-list', 'student'), false, 'a prefix is not enough');
  assert.equal(belongsTo('/staff/students', 'student'), false);
  assert.equal(belongsTo('/staff', 'coordinator'), true);
  assert.equal(belongsTo('/staff/fund/3', 'guru'), true, 'staff screens are shared by the Guru and coordinators');
  assert.equal(belongsTo('/student/home', 'guru'), false);
  assert.equal(belongsTo('/subscriber/slokas', 'subscriber'), true);
  assert.equal(belongsTo('/staff', 'subscriber'), false);
  assert.equal(belongsTo('/student', 'pending'), false, 'a login waiting for a role opens nothing');
});

test('web: the address the app was opened at is remembered for its area only', async () => {
  const { requestedPathFor, forgetRequestedPath } = await startApp('web', { pathname: '/student/announcements/12/' });
  assert.equal(requestedPathFor('coordinator'), null);
  assert.equal(requestedPathFor('student'), '/student/announcements/12', 'trailing slash dropped');
  forgetRequestedPath();
  assert.equal(requestedPathFor('student'), null);
});

test('web: the start page counts as nothing asked for', async () => {
  const { requestedPathFor } = await startApp('web', { pathname: '/' });
  assert.equal(requestedPathFor('student'), null);
});

test('rememberRequestedPath keeps only the path, never a query or # part', async () => {
  const { rememberRequestedPath, requestedPathFor } = await startApp('web');
  rememberRequestedPath('/student/announcements/7?access_token=secret#refresh=secret');
  assert.equal(requestedPathFor('student'), '/student/announcements/7');
  rememberRequestedPath('staff/fund/3');
  assert.equal(requestedPathFor('guru'), '/staff/fund/3', 'a missing leading slash is added');
});

test('phone: an app link and an Expo Go link give the same screen', async () => {
  let app = await startApp('android', { initialUrl: 'mridangaseva://student/announcements/12?x=1' });
  assert.equal(app.requestedPathFor('student'), '/student/announcements/12');
  app = await startApp('android', { initialUrl: 'exp://192.168.1.5:8081/--/student/announcements/12' });
  assert.equal(app.requestedPathFor('student'), '/student/announcements/12');
  app = await startApp('ios', { initialUrl: 'https://app.example.org/staff/students#token' });
  assert.equal(app.requestedPathFor('coordinator'), '/staff/students');
  app = await startApp('android', { initialUrl: null });
  assert.equal(app.requestedPathFor('student'), null, 'opened from the home screen icon');
});
