// Kirtan Companion, a Playground kirtan game (screens/playground/kirtan-companion.tsx, docs/DECISIONS.md #765).

import { PlaygroundOnly } from '@/components/playground-only';
import { KirtanCompanion } from '@/screens/playground/kirtan-companion';

/** Student route. */
export default function StudentKirtanCompanionScreen() {
  return (
    <PlaygroundOnly>
      <KirtanCompanion />
    </PlaygroundOnly>
  );
}
