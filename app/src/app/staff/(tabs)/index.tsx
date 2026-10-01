// The staff Home tab ("/staff"): the Guru dashboard (G1) for the Guru, the coordinator dashboard
// (C1) for a coordinator. Both live in src/screens/ so this one address serves both roles; the
// old addresses /guru and /coordinator are gone (docs/DECISIONS.md #36).

import { useAuth } from '@/auth/auth-provider';
import { CoordinatorHome } from '@/screens/coordinator-home';
import { GuruHome } from '@/screens/guru-home';

/** The home of the signed-in staff member's role. */
export default function StaffHome() {
  const { area } = useAuth();
  return area === 'guru' ? <GuruHome /> : <CoordinatorHome />;
}
