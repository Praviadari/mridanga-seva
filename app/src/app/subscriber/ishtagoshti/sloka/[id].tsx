// I3 One sloka for a public subscriber (screens/ishtagoshti-sloka.tsx; docs/DECISIONS.md #88).

import { RouteIdGuard } from '@/components/route-id-guard';
import { IshtagoshtiSloka } from '@/screens/ishtagoshti-sloka';

/** Subscriber route of I3. */
function SubscriberIshtagoshtiSlokaScreenContent() {
  return <IshtagoshtiSloka area="subscriber" />;
}

/** Checks the address's id before the screen loads anything (D6-07). */
export default function SubscriberIshtagoshtiSlokaScreen() {
  return (
    <RouteIdGuard kind="number">
      <SubscriberIshtagoshtiSlokaScreenContent />
    </RouteIdGuard>
  );
}
