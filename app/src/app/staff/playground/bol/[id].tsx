// One bol of the dictionary (screens/staff-playground/bol-editor.tsx, docs/DECISIONS.md #742).

import { PlaygroundOnly } from '@/components/playground-only';
import { BolEditor } from '@/screens/staff-playground/bol-editor';

/** Staff route. */
export default function StaffPlaygroundBolScreen() {
  return (
    <PlaygroundOnly>
      <BolEditor />
    </PlaygroundOnly>
  );
}
