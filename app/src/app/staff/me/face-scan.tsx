// Me > Face scan (Phase 3, docs/DECISIONS.md #434): the student's S15 page (student/face-scan.tsx) for a staff
// member's own record (0053). A colleague records the face consent and confirms the enrolment at the desk (C25):
// nobody does either for their own record.

import FaceScanScreen from '../../student/face-scan';

/** Face scan of the own record, on top of Me. */
export default function MeFaceScanScreen() {
  return <FaceScanScreen />;
}
