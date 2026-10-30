// Voice Companion, a Playground voice game (screens/playground/voice-companion.tsx, docs/DECISIONS.md #763).

import { PlaygroundOnly } from '@/components/playground-only';
import { VoiceCompanion } from '@/screens/playground/voice-companion';

/** Student route. */
export default function StudentVoiceCompanionScreen() {
  return (
    <PlaygroundOnly>
      <VoiceCompanion />
    </PlaygroundOnly>
  );
}
