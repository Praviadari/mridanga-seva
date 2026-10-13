// A delete asked "Yes, delete?" in the same place as Delete (practice log, the Guru's assessment and reply
// deletes, a recording): a double tap, a tremor or a slow phone used to delete before the question was ever
// seen. The confirm button now ignores taps for a moment after it appears (audit phase 4 P2-06,
// docs/DECISIONS.md #332).

/** How long a just-shown confirm ignores taps, in milliseconds: longer than a double tap. */
export const SECOND_TAP_MS = 600;

let shownAt = 0;

/** Call when the confirm question appears. */
export function confirmShown(now = Date.now()): void {
  shownAt = now;
}

/** True when the confirm has been on screen long enough for a deliberate tap. */
export function confirmReady(now = Date.now()): boolean {
  return now - shownAt >= SECOND_TAP_MS;
}
