// The web version's service worker (offline-shell.web.ts, docs/DECISIONS.md #513). The phone app keeps itself on the
// phone already, so here both do nothing.

/** Registers the service worker after a sign-in (web only). */
export function keepOfflineShell(): void {}

/** Removes the service worker and what it kept (web only). Never throws. */
export async function forgetOfflineShell(): Promise<void> {}
