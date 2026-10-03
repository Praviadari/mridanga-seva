// S5 Practice tools for the Guru and coordinators: the same metronome and taal player as students
// get, without the practice timer (staff practice is not logged); the Guru also finds "Edit taals"
// (screens/practice-tools.tsx; Phase 2 slice 3, docs/DECISIONS.md #54).

import { PracticeTools } from '@/screens/practice-tools';

/** Staff route of S5. */
export default function StaffPracticeScreen() {
  return <PracticeTools area="staff" />;
}