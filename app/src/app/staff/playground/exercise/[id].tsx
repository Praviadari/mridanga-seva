// One exercise of the bank, with its preview (screens/staff-playground/exercise-editor.tsx, docs/DECISIONS.md #745).

import { PlaygroundOnly } from '@/components/playground-only';
import { ExerciseEditor } from '@/screens/staff-playground/exercise-editor';

/** Staff route. */
export default function StaffPlaygroundExerciseScreen() {
  return (
    <PlaygroundOnly>
      <ExerciseEditor />
    </PlaygroundOnly>
  );
}
