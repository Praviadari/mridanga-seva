// Rhythm Switching, a Playground rhythm game (screens/rhythm-switching.tsx, docs/DECISIONS.md #751).

import { PlaygroundOnly } from '@/components/playground-only';
import { RhythmSwitching } from '@/screens/rhythm-switching';

/** Student route. */
export default function StudentRhythmSwitchingScreen() {
  return (
    <PlaygroundOnly>
      <RhythmSwitching />
    </PlaygroundOnly>
  );
}
