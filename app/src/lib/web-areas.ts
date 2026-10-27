// Every screen loads with the app on phones; only the web version loads the staff and student screens later
// (web-areas.web.ts, docs/DECISIONS.md #590, #650). Nothing to do here.

/** Starts loading the screens a login of this area uses on the web; nothing on phones. */
export function preloadAreasFor(_area: string): void {}
