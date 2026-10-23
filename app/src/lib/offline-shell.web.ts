// The web version offline (docs/DECISIONS.md #513; audit 22-10-2026 fix 7, LA-12 / Q-5). After a sign-in the app
// registers the service worker /sw.js (scripts/service-worker.js, written by the web export), which keeps the site's
// own files, the same for everyone, so an iPhone or web member opens the app, My QR, the practice tools, the mantra
// and the lessons list without a signal; their own data is what the app already keeps in localStorage. At sign-out
// (lib/device-traces.ts) and whenever the app starts signed out, the worker is told to stop, unregistered, and every
// cache it made is deleted: nothing is left on a shared phone or computer.
//
// Only in an exported build (NODE_ENV production): Metro's development server must never be cached. Browsers allow a
// service worker on https and on localhost only.

const WORKER = '/sw.js';
const PREFIX = 'mridanga-shell-';

/** True where a service worker may run and should. */
function possible(): boolean {
  return (
    process.env.NODE_ENV === 'production' &&
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    window.isSecureContext
  );
}

/** Registers the service worker after a sign-in and asks it to keep any file it is still missing. Never throws. */
export function keepOfflineShell(): void {
  if (!possible()) return;
  navigator.serviceWorker
    .register(WORKER, { scope: '/', updateViaCache: 'none' })
    .then(async () => {
      const ready = await navigator.serviceWorker.ready;
      ready.active?.postMessage({ type: 'keep' });
    })
    .catch(() => undefined); // no worker (blocked, private window): the app works online as before
}

/** Stops and removes every service worker of this site and deletes what they kept. Never throws. */
export async function forgetOfflineShell(): Promise<void> {
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        for (const worker of [registration.active, registration.waiting, registration.installing]) worker?.postMessage({ type: 'forget' });
        await registration.unregister();
      }
    } catch {
      // Storage blocked: nothing was registered either.
    }
  }
  if (typeof caches !== 'undefined') {
    try {
      for (const key of await caches.keys()) {
        if (key.startsWith(PREFIX)) await caches.delete(key);
      }
    } catch {
      // As above.
    }
  }
}
