// Coming soon for the staff area: what Instruments and Events on the staff home's ring open
// (src/screens/coming-soon.tsx has the page; docs/DECISIONS.md #39).

import { ComingSoon } from '@/screens/coming-soon';

/** The staff area's Coming soon page; Back to home leads to /staff. */
export default function StaffComingSoonScreen() {
  return <ComingSoon home="/staff" />;
}
