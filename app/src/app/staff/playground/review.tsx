// Waiting for approval (screens/staff-playground/review.tsx, docs/DECISIONS.md #746).

import { PlaygroundOnly } from '@/components/playground-only';
import { ApprovalQueue } from '@/screens/staff-playground/review';

/** Staff route. */
export default function StaffPlaygroundReviewScreen() {
  return (
    <PlaygroundOnly>
      <ApprovalQueue />
    </PlaygroundOnly>
  );
}
