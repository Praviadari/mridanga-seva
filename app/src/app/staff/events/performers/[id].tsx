// C16 Performers of an event (screens/event-students.tsx; Phase 2 slice 5, docs/DECISIONS.md #61).

import { useLocalSearchParams } from 'expo-router';

import { RouteIdGuard } from '@/components/route-id-guard';
import { EventStudentsScreen } from '@/screens/event-students';

/** Route. */
function EventPerformersRouteContent() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <EventStudentsScreen id={Number(id)} mode="performers" />;
}

/** Checks the address's id before the screen loads anything (D6-07). */
export default function EventPerformersRoute() {
  return (
    <RouteIdGuard kind="number">
      <EventPerformersRouteContent />
    </RouteIdGuard>
  );
}
