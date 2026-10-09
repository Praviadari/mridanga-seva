// S11 One event for a student: answer, add to calendar (screens/event-detail.tsx; docs/DECISIONS.md #61).

import { useLocalSearchParams } from 'expo-router';

import { RouteIdGuard } from '@/components/route-id-guard';
import { EventDetailScreen } from '@/screens/event-detail';

/** Route. */
function StudentEventRouteContent() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <EventDetailScreen id={Number(id)} area="student" />;
}

/** Checks the address's id before the screen loads anything (D6-07). */
export default function StudentEventRoute() {
  return (
    <RouteIdGuard kind="number">
      <StudentEventRouteContent />
    </RouteIdGuard>
  );
}
