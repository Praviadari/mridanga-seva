// Tap the Beat: Playground pulse rounds and the tap pad play-along (screens/tap-pad.tsx, docs/DECISIONS.md #470, #750);
// only the play-along while the Playground is off for this student (#781).

import { usePlaygroundOn } from '@/components/playground-only';
import { TapPad } from '@/screens/tap-pad';

/** Student route. */
export default function StudentTapPadScreen() {
  return <TapPad rounds={usePlaygroundOn()} />;
}
