// One request id per open form (docs/DECISIONS.md #322): the same id goes with every Save of what is
// typed, so a Save repeated after a lost answer is not stored twice (data/create-once.ts). A form
// that stays open for the next entry calls renew() after a success.

import { useCallback, useRef } from 'react';

import { newRequestId } from '@/data/create-once';

/** The form's request id and a function that replaces it (after a success). */
export function useRequestId(): { requestId: () => string; renew: () => void } {
  const id = useRef<string | null>(null);
  const requestId = useCallback(() => (id.current ??= newRequestId()), []);
  const renew = useCallback(() => {
    id.current = newRequestId();
  }, []);
  return { requestId, renew };
}
