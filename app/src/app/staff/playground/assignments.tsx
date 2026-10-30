// Assignments (screens/staff-playground/assignments.tsx, docs/DECISIONS.md #748).

import { PlaygroundOnly } from '@/components/playground-only';
import { AssignmentsScreen } from '@/screens/staff-playground/assignments';

/** Staff route. */
export default function StaffPlaygroundAssignmentsScreen() {
  return (
    <PlaygroundOnly>
      <AssignmentsScreen />
    </PlaygroundOnly>
  );
}
