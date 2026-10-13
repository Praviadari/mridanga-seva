// Me > Practice (0061, docs/DECISIONS.md #319): S5 as a student sees it, with the practice timer that logs practice
// on the staff member's own record (log_practice through my_student_id, 0061 #317).

import { PracticeTools } from '@/screens/practice-tools';

/** Practice tools of the own record. */
export default function MePracticeScreen() {
  return <PracticeTools area="me" />;
}