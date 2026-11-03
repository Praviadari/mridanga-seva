// Brightness in the browser: none (docs/DECISIONS.md #800). Metro uses this file instead of ./bright-screen.ts on the
// web, so expo-brightness stays out of the web download; a page cannot change the screen's brightness.

/** Does nothing on the web. */
export async function brightenScreen(): Promise<() => void> {
  return () => undefined;
}
