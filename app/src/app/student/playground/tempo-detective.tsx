// Tempo Detective, a Playground listening game (screens/playground/tempo-detective.tsx, docs/DECISIONS.md #734).

import { PlaygroundOnly } from '@/components/playground-only';
import { TempoDetective } from '@/screens/playground/tempo-detective';

/** Student route. */
export default function StudentTempoDetectiveScreen() {
  return (
    <PlaygroundOnly>
      <TempoDetective />
    </PlaygroundOnly>
  );
}
