// Missing Beat, a Playground listening game (screens/playground/missing-beat.tsx, docs/DECISIONS.md #732).

import { PlaygroundOnly } from '@/components/playground-only';
import { MissingBeat } from '@/screens/playground/missing-beat';

/** Student route. */
export default function StudentMissingBeatScreen() {
  return (
    <PlaygroundOnly>
      <MissingBeat />
    </PlaygroundOnly>
  );
}
