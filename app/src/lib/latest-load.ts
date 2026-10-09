// Keeps the newest load of a screen. A screen loads again each time it comes into view; on a slow
// connection an older load can answer after a newer one and put stale data back on the screen
// (D6-19). Each load asks for a ticket first and shows its result only while it is the newest.

import { useCallback, useRef } from 'react';

/**
 * Returns `begin`: call it at the start of a load; the function it returns tells, once the data
 * is in, whether this load is still the newest (and so may set state).
 */
export function useLatestLoad(): () => () => boolean {
  const newest = useRef(0);
  return useCallback(() => {
    const mine = ++newest.current;
    return () => mine === newest.current;
  }, []);
}
