// Unit tests for the web version offline (docs/DECISIONS.md #513; audit 22-10-2026 fix 7, LA-12 / Q-5): the service
// worker scripts/service-worker.js run in a sandbox with a fake cache and network (what it answers, what it keeps,
// what it never touches), the file list export-web gives it, the response headers, and where the app registers and
// removes it. The browser walk on a local copy of the export is in NOTES_onboarding_offline.md. Run from app/: npm test.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';

const { neverKept, serviceWorkerSource, shellFiles } = await import('../scripts/lib/offline-shell.mjs');

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const ORIGIN = 'https://app.example.org';
const SHELL = ['/', '/_expo/static/js/web/entry-abc.js', '/assets/fonts/Ionicons.ttf', '/icon-192.png', '/manifest.json'];

/** A 200 answer of this site, as a browser hands it to the worker (type basic). */
function answer(body, type = 'text/html') {
  const response = new Response(body, { status: 200, headers: { 'content-type': type } });
  Object.defineProperty(response, 'type', { value: 'basic' });
  return response;
}

/** Loads the worker in a sandbox. `network(url)` answers its fetches; returns the pieces to drive it. */
function loadWorker({ build = 'test 1', network } = {}) {
  const listeners = {};
  const stores = new Map(); // cache name -> Map(path -> Response)
  const keyOf = (request) => new URL(typeof request === 'string' ? request : request.url, ORIGIN).pathname;
  const cacheOf = (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name);
    return {
      match: async (request) => store.get(keyOf(request))?.clone(),
      put: async (request, response) => void store.set(keyOf(request), response),
    };
  };
  const caches = {
    open: async (name) => cacheOf(name),
    keys: async () => [...stores.keys()],
    delete: async (name) => stores.delete(name),
  };
  const fetched = [];
  const sandbox = {
    self: {
      location: { origin: ORIGIN },
      addEventListener: (type, fn) => (listeners[type] = fn),
      skipWaiting: async () => undefined,
      clients: { claim: async () => undefined },
    },
    caches,
    fetch: async (request) => {
      const url = new URL(typeof request === 'string' ? request : request.url, ORIGIN);
      fetched.push(url.pathname);
      return network(url);
    },
    Request: class extends Request {
      constructor(input, init) {
        super(new URL(input, ORIGIN), init);
      }
    },
    URL,
    Promise,
    // The page's 4-second wait passes at once here.
    setTimeout: (fn) => setImmediate(fn),
  };
  vm.runInNewContext(serviceWorkerSource(read('scripts/service-worker.js'), build, SHELL), sandbox);
  /** Fires an event; returns what the worker answered (undefined when it left the request alone) and its waits. */
  async function fire(type, init = {}) {
    let answered;
    const waits = [];
    listeners[type]({ ...init, respondWith: (p) => (answered = p), waitUntil: (p) => waits.push(p) });
    await Promise.all(waits);
    return answered;
  }
  const request = (path, init = {}) => ({ url: new URL(path, ORIGIN).href, method: 'GET', mode: 'cors', ...init });
  return { fire, request, stores, fetched, cacheName: `mridanga-shell-${build.replace(/[^A-Za-z0-9._-]+/g, '-')}` };
}

const online = (url) => answer(`file ${url.pathname}`, url.pathname === '/' || !url.pathname.includes('.') ? 'text/html' : 'text/javascript');
const offline = async () => {
  throw new TypeError('Failed to fetch');
};

test('install keeps every file of the build, under its own cache name', async () => {
  const sw = loadWorker({ network: online });
  await sw.fire('install');
  assert.deepEqual([...sw.stores.keys()], [sw.cacheName]);
  assert.deepEqual([...sw.stores.get(sw.cacheName).keys()].sort(), [...SHELL].sort());
});

test('Supabase, YouTube and other hosts are never answered or kept: no stalled request across reloads (#513)', async () => {
  const sw = loadWorker({ network: online });
  await sw.fire('install');
  for (const href of ['https://fhuqykssenuhczdqbafu.supabase.co/rest/v1/students', 'https://www.youtube.com/embed/x']) {
    assert.equal(await sw.fire('fetch', { request: { url: href, method: 'GET', mode: 'cors' } }), undefined, href);
  }
  assert.equal(await sw.fire('fetch', { request: sw.request('/rest/v1/rpc/x', { method: 'POST' }) }), undefined, 'no write is touched');
  assert.equal(await sw.fire('fetch', { request: sw.request('/version.txt') }), undefined, 'the build id always comes fresh');
  assert.equal(await sw.fire('fetch', { request: sw.request('/zxing/2.1.2/zxing_reader.wasm') }), undefined);
  assert.equal(sw.stores.get(sw.cacheName).size, SHELL.length, 'nothing else was kept');
});

test('offline: the app\'s files and the page come from the device', async () => {
  let net = online;
  const sw = loadWorker({ network: (url) => net(url) });
  await sw.fire('install');
  net = offline;
  const script = await sw.fire('fetch', { request: sw.request('/_expo/static/js/web/entry-abc.js') });
  assert.equal(await script.text(), 'file /_expo/static/js/web/entry-abc.js');
  const page = await sw.fire('fetch', { request: sw.request('/student/my-qr', { mode: 'navigate' }) });
  assert.equal(await page.text(), 'file /', 'any address gets the kept single page');
});

test('online: the page comes from the network and the fresh copy is kept; a slow network gets the kept copy', async () => {
  let net = online;
  const sw = loadWorker({ network: (url) => net(url) });
  await sw.fire('install');
  net = () => answer('new page');
  const fresh = await sw.fire('fetch', { request: sw.request('/waiting/practice', { mode: 'navigate' }) });
  assert.equal(await fresh.text(), 'new page');
  assert.equal(await (await sw.stores.get(sw.cacheName).get('/')).clone().text(), 'new page', 'kept under / for every address');
  net = () => new Promise(() => undefined); // lie-fi: no answer at all
  const slow = await sw.fire('fetch', { request: sw.request('/', { mode: 'navigate' }) });
  assert.equal(await slow.text(), 'new page', 'after the wait, the kept page');
});

test('a page that is not a 200 HTML answer is never kept', async () => {
  let net = online;
  const sw = loadWorker({ network: (url) => net(url) });
  await sw.fire('install');
  net = () => new Response('oops', { status: 500, headers: { 'content-type': 'text/html' } });
  await sw.fire('fetch', { request: sw.request('/', { mode: 'navigate' }) });
  assert.equal(await (await sw.stores.get(sw.cacheName).get('/')).clone().text(), 'file /');
});

test('the first visit without a kept page waits for the network, as without a worker', async () => {
  const sw = loadWorker({ network: offline });
  await assert.rejects(sw.fire('fetch', { request: sw.request('/', { mode: 'navigate' }) }), /Failed to fetch/);
});

test('a new build replaces the old cache when it takes over', async () => {
  const old = loadWorker({ build: 'live a1 2026-10-22', network: online });
  await old.fire('install');
  const next = loadWorker({ build: 'live b2 2026-10-23', network: online });
  for (const [name, store] of old.stores) next.stores.set(name, store);
  await next.fire('install');
  await next.fire('activate');
  assert.deepEqual([...next.stores.keys()], [next.cacheName]);
});

test('sign-out ("forget"): every cache goes and nothing more is answered or kept; "keep" after a sign-in fills it again', async () => {
  const sw = loadWorker({ network: online });
  await sw.fire('install');
  await sw.fire('message', { data: { type: 'forget' } });
  assert.equal(sw.stores.size, 0);
  assert.equal(await sw.fire('fetch', { request: sw.request('/_expo/static/js/web/entry-abc.js') }), undefined);
  assert.equal(sw.stores.size, 0, 'a request after forget keeps nothing');
  await sw.fire('message', { data: { type: 'keep' } });
  assert.equal(sw.stores.get(sw.cacheName).size, SHELL.length);
  const before = sw.fetched.length;
  await sw.fire('message', { data: { type: 'keep' } });
  assert.equal(sw.fetched.length, before, '"keep" fetches only what is missing');
});

test('export-web: the file list is the site\'s own files, the page as /, never the build id, headers, maps or the QR reader', () => {
  const dist = mkdtempSync(join(tmpdir(), 'offline-shell-'));
  try {
    for (const file of ['index.html', '_headers', 'version.txt', 'sw.js', 'metadata.json', 'manifest.json',
      '_expo/static/js/web/entry-abc.js', '_expo/static/js/web/entry-abc.js.map', 'assets/vendor/x.png', 'zxing/2.1.2/zxing_reader.wasm']) {
      mkdirSync(join(dist, file, '..'), { recursive: true });
      writeFileSync(join(dist, file), 'x');
    }
    const { shell, bytes } = shellFiles(dist);
    assert.deepEqual(shell, ['/', '/_expo/static/js/web/entry-abc.js', '/assets/vendor/x.png', '/manifest.json']);
    assert.equal(bytes, 4);
    assert.equal(neverKept('/zxing/a.wasm') && neverKept('/sw.js') && !neverKept('/icon-192.png'), true);
  } finally {
    rmSync(dist, { recursive: true, force: true });
  }
  const filled = serviceWorkerSource("const BUILD = '__BUILD__';\nconst SHELL = __SHELL__;", 'test 3c6d764 2026-10-23T10:00:00.000Z', ['/']);
  assert.equal(filled, 'const BUILD = "test-3c6d764-2026-10-23T10-00-00.000Z";\nconst SHELL = ["/"];');
  assert.throws(() => serviceWorkerSource('no placeholders', 'x', []), /placeholder/);
  const exporter = read('scripts/export-web.mjs');
  assert.match(exporter, /writeFileSync\(join\(DIST, 'sw\.js'\), worker\)/);
  assert.match(exporter, /new Function\(worker\)/, 'the written worker must parse');
});

test('headers: sw.js is asked fresh; the strict policy is unchanged (no inline script, workers from this site only)', () => {
  const headers = read('public/_headers');
  assert.match(headers, /\n\/sw\.js\n {2}Cache-Control: no-cache\n/);
  const csp = /Content-Security-Policy: (.*)/.exec(headers)[1];
  assert.match(csp, /script-src 'self' 'wasm-unsafe-eval' __PLAYER_SCRIPT__;/);
  assert.match(csp, /worker-src 'self' blob:;/);
  assert.match(csp, /connect-src 'self' data: blob: __SUPABASE__;/);
  assert.doesNotMatch(csp, /unsafe-inline'[^;]*script|script-src[^;]*unsafe-inline/);
});

test('the app registers the worker only in an exported build after sign-in, and removes it with its caches at sign-out', () => {
  const web = read('src/lib/offline-shell.web.ts');
  assert.match(web, /process\.env\.NODE_ENV === 'production'/, 'never the development server');
  assert.match(web, /window\.isSecureContext/);
  assert.match(web, /register\(WORKER, \{ scope: '\/', updateViaCache: 'none' \}\)/);
  assert.match(web, /postMessage\(\{ type: 'forget' \}\)[\s\S]*registration\.unregister\(\)[\s\S]*caches\.delete\(key\)/);
  const native = read('src/lib/offline-shell.ts');
  assert.match(native, /export function keepOfflineShell\(\): void \{\}/, 'nothing on phones');
  const layout = read('src/app/_layout.tsx');
  assert.match(layout, /if \(signedIn\) keepOfflineShell\(\);\s*else if \(area === 'signedOut'\) void forgetOfflineShell\(\);/);
  const traces = read('src/lib/device-traces.ts');
  assert.match(traces, /forgetOfflineShell\(\)/);
  assert.match(traces, /forgetWaitingPractice\(\);/);
});
