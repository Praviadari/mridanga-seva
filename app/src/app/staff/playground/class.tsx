// Class progress (screens/staff-playground/class-progress.tsx, docs/DECISIONS.md #749).

import { PlaygroundOnly } from '@/components/playground-only';
import { ClassProgress } from '@/screens/staff-playground/class-progress';

/** Staff route. */
export default function StaffPlaygroundClassScreen() {
  return (
    <PlaygroundOnly>
      <ClassProgress />
    </PlaygroundOnly>
  );
}
