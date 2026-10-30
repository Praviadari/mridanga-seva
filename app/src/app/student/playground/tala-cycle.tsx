// Tāla Cycle Master, a Playground rhythm game (screens/tala-cycle.tsx, docs/DECISIONS.md #753).

import { PlaygroundOnly } from '@/components/playground-only';
import { TalaCycle } from '@/screens/tala-cycle';

/** Student route. */
export default function StudentTalaCycleScreen() {
  return (
    <PlaygroundOnly>
      <TalaCycle />
    </PlaygroundOnly>
  );
}
