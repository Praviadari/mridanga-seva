// Rhythm Builder, a Playground game (screens/playground/rhythm-builder.tsx, docs/DECISIONS.md #733).

import { PlaygroundOnly } from '@/components/playground-only';
import { RhythmBuilder } from '@/screens/playground/rhythm-builder';

/** Student route. */
export default function StudentRhythmBuilderScreen() {
  return (
    <PlaygroundOnly>
      <RhythmBuilder />
    </PlaygroundOnly>
  );
}
