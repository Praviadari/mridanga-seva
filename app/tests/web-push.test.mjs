// Unit tests for web push in the web version (migration 0062, docs/DECISIONS.md #596-#609): where it may be offered
// (an iPhone only in the home-screen app), whose a browser's subscription is at a start, the service worker's 'push'
// and 'notificationclick' handlers in a sandbox, the export's key check, and that only a tap asks. The sending and the
// encryption are tested in supabase/tests (push-messages.test.mjs, smoke-test.mjs). Run from app/: npm test.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const rules = await import('../src/lib/web-push-rules.ts');
const { serviceWorkerSource } = await import('../scripts/lib/offline-shell.mjs');
const { webPushKeyFrom } = await import('../scripts/bundle-checks.mjs');

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
// A canonical key: 65 bytes, the first one 4 (an uncompressed P-256 point's shape).
const KEY = Buffer.from([4, ...Array.from({ length: 64 }, (_, i) => (i * 37 + 11) % 256)]).toString('base64url');
const IPHONE_17 = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IPHONE_16_3 = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const IPAD_DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
const facts = (over = {}) => ({ userAgent: ANDROID, maxTouchPoints: 5, standalone: false, serviceWorker: true, pushManager: true,
  notification: true, secure: true, built: true, key: KEY, ...over });

test('offered in a browser that can do it, on an exported build with the site key', () => {
  assert.equal(rules.webPushPlace(facts()), 'ready');
  assert.equal(rules.webPushPlace(facts({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/129', maxTouchPoints: 0 })), 'ready');
  assert.equal(rules.webPushPlace(facts({ key: undefined })), 'not-set-up', 'no key in the build: not offered at all');
  assert.equal(rules.webPushPlace(facts({ key: 'x'.repeat(43) })), 'not-set-up', 'a private-key-sized value is not a key');
  assert.equal(rules.webPushPlace(facts({ built: false })), 'not-set-up', 'the development server has no service worker');
  assert.equal(rules.webPushPlace(facts({ pushManager: false })), 'unsupported');
  assert.equal(rules.webPushPlace(facts({ secure: false })), 'unsupported');
});

test('an iPhone: only in the home-screen app, iOS 16.4 and later; Safari explains Add to Home Screen instead (#603)', () => {
  assert.equal(rules.webPushPlace(facts({ userAgent: IPHONE_17, pushManager: false })), 'iphone-add-to-home');
  assert.equal(rules.webPushPlace(facts({ userAgent: IPHONE_17, standalone: true })), 'ready');
  assert.equal(rules.webPushPlace(facts({ userAgent: IPHONE_16_3, standalone: true })), 'iphone-too-old');
  assert.equal(rules.webPushPlace(facts({ userAgent: IPAD_DESKTOP, maxTouchPoints: 5 })), 'iphone-add-to-home', 'an iPad asking for the desktop site');
  assert.equal(rules.webPushPlace(facts({ userAgent: IPAD_DESKTOP, maxTouchPoints: 0 })), 'ready', 'a Mac is not an iPad');
  assert.deepEqual(rules.iosVersion(IPHONE_16_3), [16, 3]);
  assert.equal(rules.iosVersion(ANDROID), null);
});

test('keys: the public key as bytes and back; a subscription made with another key is recognised', () => {
  assert.equal(rules.validPublicKey(KEY), true);
  const bytes = rules.keyBytes(KEY);
  assert.equal(bytes.length, 65);
  assert.equal(rules.base64Url(bytes.buffer), KEY);
  assert.equal(rules.madeWithKey(bytes.buffer, KEY), true);
  assert.equal(rules.madeWithKey(rules.keyBytes(Buffer.from([4, ...new Array(64).fill(1)]).toString('base64url')).buffer, KEY), false);
  assert.equal(rules.madeWithKey(null, KEY), false);
  assert.equal(rules.base64Url(null), '');
});

test('a start never hands a browser to another login; this login\'s is saved again weekly (#604)', () => {
  const now = Date.UTC(2026, 9, 24);
  const mine = { user: 'u1', endpoint: 'https://push/1', at: now - 1000 };
  assert.equal(rules.startAction(mine, 'u1', 'https://push/1', 'granted', now), 'none');
  assert.equal(rules.startAction({ ...mine, at: now - rules.SAVE_AGAIN_MS }, 'u1', 'https://push/1', 'granted', now), 'save');
  assert.equal(rules.startAction({ ...mine, at: now + 60000 }, 'u1', 'https://push/1', 'granted', now), 'save', 'a clock set back');
  assert.equal(rules.startAction(mine, 'u2', 'https://push/1', 'granted', now), 'end', 'another login\'s subscription is ended');
  assert.equal(rules.startAction(null, 'u1', 'https://push/1', 'granted', now), 'end', 'a subscription nobody noted is ended');
  assert.equal(rules.startAction(mine, 'u1', 'https://push/2', 'granted', now), 'end');
  assert.equal(rules.startAction(mine, 'u1', 'https://push/1', 'denied', now), 'remove', 'permission taken back');
  assert.equal(rules.startAction(mine, 'u1', null, 'granted', now), 'forget', 'the browser dropped it');
  assert.equal(rules.startAction(mine, 'u2', null, 'granted', now), 'drop-note');
  assert.equal(rules.startAction(null, 'u1', null, 'default', now), 'none');
  assert.deepEqual(rules.parseSaved(JSON.stringify(mine)), mine);
  assert.equal(rules.parseSaved('{"user":1}'), null);
  assert.equal(rules.parseSaved('not json'), null);
});

test('only an app path is ever opened from a notification', () => {
  assert.equal(rules.openablePath('/student/announcements/7'), '/student/announcements/7');
  for (const bad of ['//evil.example/x', 'https://evil.example/', 'javascript:alert(1)', '/a?b=c', '/a b', 7, null]) {
    assert.equal(rules.openablePath(bad), '/', String(bad));
  }
});

/** The built worker in a sandbox, with spies for notifications and windows. */
function loadWorker(windows = []) {
  const listeners = {};
  const shown = [];
  const opened = [];
  const sandbox = {
    self: {
      location: { origin: 'https://app.example.org' },
      addEventListener: (type, fn) => (listeners[type] = fn),
      registration: { showNotification: async (title, options) => void shown.push({ title, options }) },
      clients: { claim: async () => undefined, matchAll: async () => windows, openWindow: async (url) => void opened.push(url) },
      skipWaiting: async () => undefined,
    },
    caches: { open: async () => ({}), keys: async () => [] },
    URL,
  };
  vm.runInNewContext(serviceWorkerSource(read('scripts/service-worker.js'), 'test 1', ['/']), sandbox);
  /** Runs one event; resolves when what it waits for is done. */
  const fire = async (type, event) => {
    const waits = [];
    listeners[type]({ ...event, waitUntil: (p) => waits.push(p) });
    await Promise.all(waits);
  };
  return { fire, shown, opened };
}

test('the service worker shows every push, with the text cut and only an app path kept (#606)', async () => {
  const worker = loadWorker();
  const push = (data) => ({ data: { json: () => data } });
  await worker.fire('push', push({ title: 'Kirtan', body: 'Sunday 17:00', url: '/student/announcements/7', tag: 'announcement-7' }));
  await worker.fire('push', push({ title: 'x'.repeat(500), body: 'y'.repeat(900), url: 'https://evil.example/' }));
  await worker.fire('push', { data: { json: () => { throw new Error('not json'); } } });
  await worker.fire('push', { data: null });
  assert.equal(worker.shown.length, 4, 'every push shows a notification (an iPhone drops silent subscriptions)');
  assert.equal(worker.shown[0].title, 'Kirtan');
  assert.equal(worker.shown[0].options.body, 'Sunday 17:00');
  assert.equal(worker.shown[0].options.data.url, '/student/announcements/7');
  assert.equal(worker.shown[0].options.tag, 'announcement-7');
  assert.equal(worker.shown[1].title.length, 120);
  assert.equal(worker.shown[1].options.body.length, 300);
  assert.equal(worker.shown[1].options.data.url, '/');
  assert.equal(worker.shown[2].title, 'Mridanga Seva');
  assert.equal(worker.shown[3].options.icon, '/icon-192.png');
});

test('a tap focuses the open app and posts the screen, or opens a window at it', async () => {
  const posted = [];
  let focused = 0;
  const tab = { url: 'https://app.example.org/student', focus: async () => void focused++, postMessage: (m) => posted.push(m) };
  const other = { url: 'https://elsewhere.example/', focus: async () => assert.fail('another site is never focused'), postMessage: () => assert.fail() };
  const withTab = loadWorker([other, tab]);
  let closed = 0;
  const click = (url) => ({ notification: { close: () => void closed++, data: { url } } });
  await withTab.fire('notificationclick', click('/student/announcements/7'));
  assert.equal(focused, 1);
  // The message comes from the sandbox's realm: compared as JSON.
  assert.equal(JSON.stringify(posted), JSON.stringify([{ type: 'open', url: '/student/announcements/7' }]));
  assert.equal(withTab.opened.length, 0);
  const none = loadWorker([]);
  await none.fire('notificationclick', click('//evil.example/'));
  assert.deepEqual(none.opened, ['/']);
  assert.equal(closed, 2);
});

test('the export takes only a public key for the site (#605)', () => {
  assert.deepEqual(webPushKeyFrom('EXPO_PUBLIC_SUPABASE_URL=x\n'), {});
  assert.deepEqual(webPushKeyFrom(`EXPO_PUBLIC_WEB_PUSH_KEY=${KEY}\n`), { key: KEY });
  assert.match(webPushKeyFrom(`EXPO_PUBLIC_WEB_PUSH_KEY=${'a'.repeat(43)}\n`).error, /private key/);
});

test('asking happens only on a tap in My profile, never in the phone app (#603)', () => {
  const sources = ['src/lib/push.web.ts', 'src/lib/web-push.web.ts', 'src/components/web-push-section.tsx', 'src/app/_layout.tsx'];
  const asks = sources.filter((path) => read(path).includes('requestPermission('));
  assert.deepEqual(asks, ['src/lib/web-push.web.ts']);
  assert.match(read('src/lib/web-push.web.ts'), /export function turnOnWebPush\(\)[\s\S]*?Notification\.requestPermission\(\)/);
  assert.match(read('src/components/web-push-section.tsx'), /onPress=\{turnOn\}/);
  assert.match(read('src/screens/my-profile.tsx'), /<WebPushSection \/>/);
  assert.match(read('src/lib/web-push.ts'), /return 'native';/);
  assert.doesNotMatch(read('src/lib/web-push.ts'), /^import /m, 'the phone version loads nothing');
  assert.match(read('src/components/web-push-section.tsx'), /if \(place === 'native' \|\| place === 'not-set-up'\) return null;/);
  assert.match(read('src/lib/device-traces.ts'), /forgetWebPushNote\(\);/);
});
