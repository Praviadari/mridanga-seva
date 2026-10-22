// Me > Check in / Check out by face (Phase 3, docs/DECISIONS.md #434): the student's S16 page (student/self-scan.tsx)
// for a staff member's own record (0053). The only way a coordinator records their own visit: the server lets the
// self-scan path through its own-record rule (0071), after the same checks as for a student.

import SelfScanScreen from '../../student/self-scan';

/** The self check-in / check-out of the own record, on top of Me. */
export default function MeSelfScanScreen() {
  return <SelfScanScreen />;
}
