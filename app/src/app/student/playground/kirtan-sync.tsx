// Kirtan Synchronization Challenge, a Playground kirtan game (screens/playground/kirtan-sync.tsx, docs/DECISIONS.md #765).

import { PlaygroundOnly } from '@/components/playground-only';
import { KirtanSync } from '@/screens/playground/kirtan-sync';

/** Student route. */
export default function StudentKirtanSyncScreen() {
  return (
    <PlaygroundOnly>
      <KirtanSync />
    </PlaygroundOnly>
  );
}
