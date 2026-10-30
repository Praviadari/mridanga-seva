// Echo Challenge: Playground calls and Echo me's call and response (screens/echo-me.tsx, docs/DECISIONS.md #472, #752);
// only the call and response while the Playground is off for this student (#781).

import { usePlaygroundOn } from '@/components/playground-only';
import { EchoMe } from '@/screens/echo-me';

/** Student route. */
export default function StudentEchoMeScreen() {
  return <EchoMe rounds={usePlaygroundOn()} />;
}
