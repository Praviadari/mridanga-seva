// Vocal Sadhana Studio, a Playground voice game (screens/playground/vocal-studio.tsx, docs/DECISIONS.md #763).

import { PlaygroundOnly } from '@/components/playground-only';
import { VocalStudio } from '@/screens/playground/vocal-studio';

/** Student route. */
export default function StudentVocalStudioScreen() {
  return (
    <PlaygroundOnly>
      <VocalStudio />
    </PlaygroundOnly>
  );
}
