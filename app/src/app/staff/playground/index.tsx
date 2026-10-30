// Rhythm Playground for facilitators (screens/staff-playground/admin-home.tsx, docs/DECISIONS.md #740).

import { PlaygroundOnly } from '@/components/playground-only';
import { PlaygroundAdminHome } from '@/screens/staff-playground/admin-home';

/** Staff route. */
export default function StaffPlaygroundScreen() {
  return (
    <PlaygroundOnly>
      <PlaygroundAdminHome />
    </PlaygroundOnly>
  );
}
