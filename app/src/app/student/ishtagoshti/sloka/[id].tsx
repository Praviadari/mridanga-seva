// I3 One sloka for the student area (screens/ishtagoshti-sloka.tsx; docs/DECISIONS.md #57).

import { RouteIdGuard } from '@/components/route-id-guard';
import { IshtagoshtiSloka } from '@/screens/ishtagoshti-sloka';

/** Student route of I3. */
function StudentIshtagoshtiSlokaScreenContent() {
  return <IshtagoshtiSloka area="student" />;
}

/** Checks the address's id before the screen loads anything (D6-07). */
export default function StudentIshtagoshtiSlokaScreen() {
  return (
    <RouteIdGuard kind="number">
      <StudentIshtagoshtiSlokaScreenContent />
    </RouteIdGuard>
  );
}
