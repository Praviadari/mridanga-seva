// Coming soon for the student area: what Events on the student home's ring opens
// (src/screens/coming-soon.tsx has the page; docs/DECISIONS.md #41).

import { ComingSoon } from '@/screens/coming-soon';

/** The student area's Coming soon page; Back to home leads to /student. */
export default function StudentComingSoonScreen() {
  return <ComingSoon home="/student" />;
}
