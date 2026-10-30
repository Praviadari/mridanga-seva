// Sound Explorer, a Playground listening game (screens/playground/sound-explorer.tsx, docs/DECISIONS.md #760).

import { PlaygroundOnly } from '@/components/playground-only';
import { SoundExplorer } from '@/screens/playground/sound-explorer';

/** Student route. */
export default function StudentSoundExplorerScreen() {
  return (
    <PlaygroundOnly>
      <SoundExplorer />
    </PlaygroundOnly>
  );
}
