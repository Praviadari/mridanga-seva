// Sound Detective, the Rhythm Playground's first game, at the address "Which bol?" had (screens/playground/
// sound-detective.tsx, docs/DECISIONS.md #471, #731): old links and What's new entries still open it. While the
// Playground is off for this student it is the plain "Which bol?" quiz again (#781).

import { usePlaygroundOn } from '@/components/playground-only';
import { SoundDetective } from '@/screens/playground/sound-detective';
import { WhichBol } from '@/screens/which-bol';

/** Student route. */
export default function StudentWhichBolScreen() {
  return usePlaygroundOn() ? <SoundDetective /> : <WhichBol />;
}
