// Unit tests for the launch clean-up on the device and the web (audit phase 3, brief L7; docs/DECISIONS.md
// #283-#285): S5-02 recordings go at sign-out, S5-03 old form drafts go at app start, S5-06 the phone's
// lesson WebView stays on its page. S5-01 (the web YouTube player) is in youtube-embed.test.mjs.
// Run from app/: npm test.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import './stubs/register.mjs';

const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
};

const { lessonNavigation, PLAYER_BASE_URL } = await import('../src/lib/lesson-navigation.ts');
const traces = await import('../src/lib/device-traces.ts');
const webRecordings = await import('../src/lib/my-recordings.web.ts');
const drafts = await import('../src/lib/form-drafts.ts');

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

// ---- S5-02: recordings at sign-out ----------------------------------------------------------

test('S5-02: every sign-out deletes the kept takes and the recorder\'s cache folders on a phone', async () => {
  globalThis.__testOS = 'android';
  globalThis.__testFolders = new Set(['document/recordings', 'cache/Audio', 'cache/ExpoAudio', 'cache/ImagePicker', 'document/other']);
  globalThis.__testDeleted = [];
  globalThis.__testCalls = [];
  await traces.clearDeviceTraces();
  assert.deepEqual([...globalThis.__testFolders], ['document/other'], 'nothing else of the app\'s is touched');
  for (const path of ['document/recordings', 'cache/Audio', 'cache/ExpoAudio']) assert.ok(globalThis.__testDeleted.includes(path), path);
  for (const call of ['saved-card', 'notifications', 'image-memory', 'image-disk']) assert.ok(globalThis.__testCalls.includes(call), call);
});

test('S5-02: a folder still in use does not stop the rest, and clearDeviceTraces never throws', async () => {
  globalThis.__testOS = 'android';
  globalThis.__testFolders = new Set(['document/recordings', 'cache/Audio', 'cache/DocumentPicker']);
  globalThis.__testLocked = new Set(['cache/Audio']);
  globalThis.__testDeleted = [];
  await traces.clearDeviceTraces();
  assert.deepEqual([...globalThis.__testFolders], ['cache/Audio']);
  globalThis.__testLocked = new Set(['document/recordings']);
  await assert.doesNotReject(traces.clearDeviceTraces());
  globalThis.__testLocked = undefined;
});

test('S5-02: in the browser the open tab forgets its takes at sign-out', async () => {
  const revoked = [];
  const realRevoke = URL.revokeObjectURL;
  URL.revokeObjectURL = (u) => revoked.push(u);
  try {
    await webRecordings.keepMyRecording({ uri: 'blob:take-1', durationMs: 1000, recordedAt: '2026-10-13T10:00:00Z' }, null);
    await webRecordings.keepMyRecording({ uri: 'blob:take-2', durationMs: 1000, recordedAt: '2026-10-13T10:01:00Z' }, null);
    assert.equal((await webRecordings.listMyRecordings()).length, 2);
    await webRecordings.forgetMyRecordings();
    assert.deepEqual(await webRecordings.listMyRecordings(), [], 'the next login in this tab sees none');
    assert.deepEqual(revoked.sort(), ['blob:take-1', 'blob:take-2']);
  } finally {
    URL.revokeObjectURL = realRevoke;
  }
  // The shared clean-up calls it on the web too, before its phone-only part.
  assert.match(source('src/lib/device-traces.ts'), /await forgetMyRecordings\(\);[\s\S]*if \(Platform\.OS === 'web'\) return;/);
});

// ---- S5-03: drafts expire at app start ------------------------------------------------------

test('S5-03: drafts are kept 3 days, and an old one is deleted at app start without anyone signing in', () => {
  assert.equal(drafts.DRAFT_DAYS, 3);
  const day = 24 * 60 * 60 * 1000;
  store.set('formDrafts', JSON.stringify({ owner: 'user-a', savedAt: Date.now() - 2 * day, forms: { register: { x: 1 } } }));
  drafts.purgeExpiredDrafts();
  assert.notEqual(store.get('formDrafts'), undefined, 'two days old: kept');
  drafts.purgeExpiredDrafts(Date.now() + 2 * day);
  assert.equal(store.get('formDrafts'), undefined, 'four days old: gone');
  store.set('formDrafts', '{damaged');
  drafts.purgeExpiredDrafts();
  assert.equal(store.get('formDrafts'), undefined);
  const provider = source('src/auth/auth-provider.tsx');
  assert.match(provider, /useEffect\(\(\) => \{\s*\/\/[^\n]*\n[^\n]*\n\s*purgeExpiredDrafts\(\);\s*if \(supabaseConfigProblem\) return;/, 'first thing at start, before the login is read');
});

// ---- S5-06: the lesson WebView stays on its page ---------------------------------------------

test('S5-06: the WebView says it comes from our own domain', () => {
  assert.equal(PLAYER_BASE_URL, 'https://app.mridangaseva.com');
  const frame = source('src/components/lesson-video-frame.tsx');
  assert.doesNotMatch(frame, /mridanga-seva\.app/);
  assert.match(frame, /onShouldStartLoadWithRequest=\{/);
  assert.match(frame, /lessonNavigation\(request\.url, request\.isTopFrame\)/);
  assert.match(frame, /decision === 'open-outside'\) void Linking\.openURL/);
});

test('S5-06: the page, blank frames and YouTube\'s player stay; YouTube pages open outside; the rest is stopped', () => {
  const cases = [
    [PLAYER_BASE_URL, true, 'allow'],
    [`${PLAYER_BASE_URL}/`, undefined, 'allow'],
    ['about:blank', true, 'allow'],
    ['about:srcdoc', false, 'allow'],
    ['https://www.youtube.com/embed/abc?enablejsapi=1', true, 'allow'],
    ['https://www.youtube.com/watch?v=abc', true, 'open-outside'],
    ['https://youtu.be/abc', true, 'open-outside'],
    ['https://m.youtube.com/@channel', true, 'open-outside'],
    ['https://www.youtube.com/', true, 'open-outside'],
    ['https://evil.example/phish', true, 'block'],
    ['https://app.mridangaseva.com.evil.example/', true, 'block'],
    ['http://app.mridangaseva.com/', true, 'block'],
    ['javascript:alert(1)', true, 'block'],
    ['intent://scan/#Intent;scheme=zxing;end', true, 'block'],
    ['not a url', true, 'block'],
    // Frames inside the page (iOS reports them): any https, never other schemes.
    ['https://googleads.g.doubleclick.net/pagead/id', false, 'allow'],
    ['http://insecure.example/', false, 'block'],
  ];
  for (const [url, top, expected] of cases) assert.equal(lessonNavigation(url, top), expected, url);
});
