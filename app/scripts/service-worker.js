// Service worker of the web version (docs/DECISIONS.md #513; audit 22-10-2026 fix 7, LA-12 / Q-5): keeps the app
// itself on the device, so an iPhone or web member opens My QR, the practice tools, the mantra and the lessons list
// without a signal. A TEMPLATE: scripts/export-web.mjs writes it to dist/sw.js with this build's id and file list.
// src/lib/offline-shell.web.ts registers it after sign-in and removes it, with everything it kept, at sign-out.
//
// What it keeps: ONLY this site's own files of this build (the page, the scripts, fonts, icons), the same for everyone.
// Nobody's data: Supabase (records, sign-in, photos), YouTube and every other host are never touched here, not even
// passed through, so they behave exactly as without a service worker (no stalled requests across reloads, the known
// trap of a worker that answers them). What a member sees offline is what the app already keeps on the device
// (the login, the saved profile, the QR card, taals, mantras: localStorage), cleared at sign-out as before (#186).
//
// - The page (any address: the single-page app has one index.html): the network first; without an answer in 4 s, or
//   offline, the copy kept at the last good load. Kept only when it is a 200 HTML page of this site.
// - The build's files (hashed names under /_expo/static/ and /assets/, the icons and manifest): kept at install,
//   then served from the device (the student screens' file, student-area-<hash>.js, #650, among them); one missing is
//   fetched and kept. The Telugu and Hindi scripts and the staff screens (staff-area-<hash>.js, #590) are not in the list: the page names the ones it loaded ('keep'), and one loaded later
//   (a language switched to, a staff login's screens) is kept when it loads.
// - version.txt, the QR reader's WebAssembly (/zxing/, staff and scanning need the network anyway) and this file
//   itself: never kept.
// - A new build has a new file list and cache name: it installs beside the old one, takes over at once and deletes
//   the old cache.
// - Messages from the page: 'keep' adds any file of the list still missing, and the build's files the page loaded
//   (after a sign-in); 'forget' stops keeping
//   anything and deletes every cache of this site (sign-out; the page also unregisters the worker).
//
// Web push (migration 0062, docs/DECISIONS.md #606): when the person switched notifications on in My profile
// (src/lib/web-push.web.ts), notify-announcements sends each announcement or notice to this browser, encrypted; the
// browser decrypts it and hands it here as a 'push' event: {title, body, url, tag}. Every push shows a notification
// (an iPhone ends the subscription of a site whose pushes show nothing). A tap focuses an open window of the app and
// posts it the screen ({type: 'open', url}: the page opens it when it belongs to the signed-in area, src/lib/push.web.ts),
// or opens a window at that screen. Only an app path is ever opened. Nothing here touches the offline caches.

const BUILD = '__BUILD__';
const SHELL = __SHELL__;
const PREFIX = 'mridanga-shell-';
const CACHE = PREFIX + BUILD;
const PAGE_KEY = '/';
const PAGE_TIMEOUT_MS = 4000;
const NEVER = ['/sw.js', '/version.txt', '/_headers'];
const KEPT_PREFIXES = ['/_expo/static/', '/assets/'];

let forgotten = false;

/** True for a path this worker serves from its cache (the build's own files). */
function isShellFile(path) {
  if (NEVER.includes(path) || path.startsWith('/zxing/')) return false;
  return SHELL.includes(path) || KEPT_PREFIXES.some((prefix) => path.startsWith(prefix));
}

/** True for a response worth keeping: a whole 200 answer of this site, not a redirect. */
function keepable(response) {
  return !!response && response.status === 200 && response.type === 'basic' && !response.redirected;
}

/**
 * Adds the files of the list that are not kept yet, and `loaded`: the build's files the page has loaded (its language's
 * script, which the list leaves out so nobody downloads the other two languages). The browser's own HTTP cache answers
 * the hashed files already loaded, so nothing is downloaded twice; the page itself is asked again. One failure leaves
 * the others.
 */
async function keepMissing(loaded = []) {
  if (forgotten) return;
  const cache = await caches.open(CACHE);
  const paths = [...new Set([...SHELL, ...loaded.filter((path) => typeof path === 'string' && isShellFile(path))])];
  await Promise.all(
    paths.map(async (path) => {
      if (await cache.match(path)) return;
      try {
        const response = await fetch(new Request(path, path === PAGE_KEY ? { cache: 'no-cache' } : {}));
        if (keepable(response) && !forgotten) await cache.put(path, response);
      } catch {
        // Offline or a file gone: the next 'keep' tries again.
      }
    }),
  );
}

/** Deletes every cache this site's worker made. */
async function forgetAll() {
  forgotten = true;
  for (const key of await caches.keys()) {
    if (key.startsWith(PREFIX)) await caches.delete(key);
  }
}

/** Resolves after `ms`. */
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** The page: network first, the kept copy when the network fails or is slow. */
async function page(event) {
  const cache = await caches.open(CACHE);
  const network = fetch(event.request).then(async (response) => {
    const type = response.headers.get('content-type') || '';
    if (keepable(response) && type.includes('text/html') && !forgotten) await cache.put(PAGE_KEY, response.clone());
    return response;
  });
  // The network's answer is still kept when it comes after the timeout.
  event.waitUntil(network.catch(() => undefined));
  const kept = await cache.match(PAGE_KEY);
  if (!kept) return network;
  return Promise.race([network.catch(() => kept), wait(PAGE_TIMEOUT_MS).then(() => kept)]);
}

/** A file of the build: the kept copy, else the network (and kept). */
async function file(request) {
  const cache = await caches.open(CACHE);
  const kept = await cache.match(request, { ignoreSearch: true });
  if (kept) return kept;
  const response = await fetch(request);
  if (keepable(response) && !forgotten) await cache.put(request, response.clone());
  return response;
}

self.addEventListener('install', (event) => {
  event.waitUntil(keepMissing().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  const type = event.data && event.data.type;
  if (type === 'forget') event.waitUntil(forgetAll());
  else if (type === 'keep') {
    forgotten = false;
    event.waitUntil(keepMissing(Array.isArray(event.data.loaded) ? event.data.loaded : []));
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || forgotten) return;
  const url = new URL(request.url);
  // Supabase, YouTube and every other host: not answered here at all (the browser's own handling).
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(page(event));
    return;
  }
  if (isShellFile(url.pathname)) event.respondWith(file(request));
});

/** The screen a notification may open: an app path (src/lib/web-push-rules.ts openablePath), else the start page. */
function openablePath(url) {
  return typeof url === 'string' && /^\/(?!\/)[A-Za-z0-9/_-]*$/.test(url) ? url : '/';
}

/** A text of the push, cut to `max` characters, or ''. */
function text(value, max) {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = (event.data && event.data.json()) || {};
  } catch {
    data = {};
  }
  const title = text(data.title, 120).trim() || 'Mridanga Seva';
  const tag = text(data.tag, 60);
  event.waitUntil(
    self.registration.showNotification(title, {
      body: text(data.body, 300),
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: openablePath(data.url) },
      ...(tag ? { tag } : {}),
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path = openablePath(event.notification.data && event.notification.data.url);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (open) {
        await open.focus();
        open.postMessage({ type: 'open', url: path });
        return;
      }
      await self.clients.openWindow(path);
    })(),
  );
});
