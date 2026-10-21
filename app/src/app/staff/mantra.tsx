// Mantra before practice for the Guru and coordinators (screens/mantra-reader.tsx, docs/DECISIONS.md #405); the Guru
// and Ishtagoshti editors also add and edit the mantras from here (staff/mantras/[id]).

import { MantraReader } from '@/screens/mantra-reader';

/** Staff route of the mantra reader. */
export default function StaffMantraScreen() {
  return <MantraReader area="staff" />;
}
