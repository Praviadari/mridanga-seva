// S5 Practice tools for a login waiting for the desk (migration 0057, docs/DECISIONS.md #510): the metronome and the
// taal player, without the timer, log, plan or goal (those are a student's own record).

import { PracticeTools } from '@/screens/practice-tools';

/** Waiting route of S5. */
export default function WaitingPracticeScreen() {
  return <PracticeTools area="waiting" />;
}
