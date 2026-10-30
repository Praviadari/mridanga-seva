// Upload a sound or change its details (screens/staff-playground/sound-editor.tsx, docs/DECISIONS.md #743).

import { PlaygroundOnly } from '@/components/playground-only';
import { SoundEditor } from '@/screens/staff-playground/sound-editor';

/** Staff route. */
export default function StaffPlaygroundSoundScreen() {
  return (
    <PlaygroundOnly>
      <SoundEditor />
    </PlaygroundOnly>
  );
}
