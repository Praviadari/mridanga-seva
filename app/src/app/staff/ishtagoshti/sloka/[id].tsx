// I3 One sloka for the staff area (screens/ishtagoshti-sloka.tsx; docs/DECISIONS.md #57).

import { RouteIdGuard } from '@/components/route-id-guard';
import { IshtagoshtiSloka } from '@/screens/ishtagoshti-sloka';

/** Staff route of I3. */
function StaffIshtagoshtiSlokaScreenContent() {
  return <IshtagoshtiSloka area="staff" />;
}

/** Checks the address's id before the screen loads anything (D6-07). */
export default function StaffIshtagoshtiSlokaScreen() {
  return (
    <RouteIdGuard kind="number">
      <StaffIshtagoshtiSlokaScreenContent />
    </RouteIdGuard>
  );
}
