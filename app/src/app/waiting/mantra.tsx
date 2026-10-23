// Mantra before practice for a login waiting for the desk (screens/mantra-reader.tsx; 0057, docs/DECISIONS.md #510).

import { MantraReader } from '@/screens/mantra-reader';

/** Waiting route of the mantra reader. */
export default function WaitingMantraScreen() {
  return <MantraReader area="waiting" />;
}
