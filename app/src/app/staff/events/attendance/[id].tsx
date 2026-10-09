// C16 Attendance at an event (screens/event-students.tsx; Phase 2 slice 5, docs/DECISIONS.md #61).

import { useLocalSearchParams } from 'expo-router';

import { RouteIdGuard } from '@/components/route-id-guard';
import { EventStudentsScreen } from '@/screens/event-students';

/** Route. */
function EventAttendanceRouteContent() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <EventStudentsScreen id={Number(id)} mode="attendance" />;
}

/** Checks the address's id before the screen loads anything (D6-07). */
export default function EventAttendanceRoute() {
  return (
    <RouteIdGuard kind="number">
      <EventAttendanceRouteContent />
    </RouteIdGuard>
  );
}
