// Publish (head facilitator) (screens/staff-playground/publish.tsx, docs/DECISIONS.md #747).

import { PlaygroundOnly } from '@/components/playground-only';
import { PublishScreen } from '@/screens/staff-playground/publish';

/** Staff route. */
export default function StaffPlaygroundPublishScreen() {
  return (
    <PlaygroundOnly>
      <PublishScreen />
    </PlaygroundOnly>
  );
}
