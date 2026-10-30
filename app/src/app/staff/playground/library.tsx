// Content library (screens/staff-playground/library.tsx, docs/DECISIONS.md #741).

import { PlaygroundOnly } from '@/components/playground-only';
import { ContentLibrary } from '@/screens/staff-playground/library';

/** Staff route. */
export default function StaffPlaygroundLibraryScreen() {
  return (
    <PlaygroundOnly>
      <ContentLibrary />
    </PlaygroundOnly>
  );
}
