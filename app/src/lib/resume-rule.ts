// When a screen loads again after the app was away (lib/reload-on-resume.ts, #327). Pure, for the tests.

/** How long the app must have been away before a screen loads again on return. */
export const RESUME_AFTER_MS = 5 * 60_000;

/** True when the app was away long enough for the screen to load again. */
export function shouldReload(awaySince: number | null, now: number, after = RESUME_AFTER_MS): boolean {
  return awaySince !== null && now - awaySince >= after;
}