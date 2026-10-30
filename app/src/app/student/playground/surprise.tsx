// Surprise me: three games from the Playground (screens/surprise.tsx, docs/DECISIONS.md #755).

import { PlaygroundOnly } from '@/components/playground-only';
import { Surprise } from '@/screens/surprise';

/** Student route. */
export default function StudentSurpriseScreen() {
  return (
    <PlaygroundOnly>
      <Surprise />
    </PlaygroundOnly>
  );
}
