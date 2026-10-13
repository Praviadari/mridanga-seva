// A screen's loaded data that a failed reload does not wipe (audit phase 2 F9: R1-04, R2-10; docs/DECISIONS.md
// #327). The screens load into one state where null means "could not load", and null drew a full-page error:
// a reply sent, a check-in made or a vote cast was then followed by "Could not load", and the person thought it
// had failed. Now a null that follows real data keeps the data and notes when the refresh failed; the screen
// shows a slim "Could not refresh" line (components/refresh-failed.tsx). The first load still shows the error.

import { useCallback, useRef, useState, type SetStateAction } from 'react';

/** Kept is anything already loaded: not the first load (undefined), not a failure (null), not 'not_found'. */
function isData(value: unknown): boolean {
  return value !== undefined && value !== null && value !== 'not_found';
}

/**
 * The next state of a kept load: `next` as it is, unless it is a failure (null) after data, which keeps the
 * data. Pure, for the tests.
 */
export function keptValue<T>(previous: T | undefined, next: T | undefined): { value: T | undefined; failed: boolean } {
  if (next === null && isData(previous)) return { value: previous, failed: true };
  return { value: next, failed: false };
}

/**
 * useState for a screen's load, starting undefined: [value, setValue, failedAt]. setValue(null) after data
 * keeps the data and sets failedAt (milliseconds) until the next good load.
 */
export function useKeptLoad<T>(): [T | undefined, (next: SetStateAction<T | undefined>) => void, number | null] {
  const [value, setValue] = useState<T | undefined>(undefined);
  const [failedAt, setFailedAt] = useState<number | null>(null);
  const kept = useRef<T | undefined>(undefined);
  const put = useCallback((next: SetStateAction<T | undefined>) => {
    const resolved = typeof next === 'function' ? (next as (previous: T | undefined) => T | undefined)(kept.current) : next;
    const { value: shown, failed } = keptValue(kept.current, resolved);
    setFailedAt(failed ? Date.now() : null);
    if (failed) return;
    kept.current = shown;
    setValue(shown);
  }, []);
  return [value, put, failedAt];
}
