// C16 One event for staff: answers by name, Remind, performers, attendance, edit, cancel (screens/event-detail.tsx).

import { useLocalSearchParams } from 'expo-router';

import { RouteIdGuard } from '@/components/route-id-guard';
import { EventDetailScreen } from '@/screens/event-detail';

/** Route. */
function StaffEventRouteContent() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <EventDetailScreen id={Number(id)} area="staff" />;
}

/** Checks the address's id before the screen loads anything (D6-07). */
export default function StaffEventRoute() {
  return (
    <RouteIdGuard kind="number">
      <StaffEventRouteContent />
    </RouteIdGuard>
  );
}
