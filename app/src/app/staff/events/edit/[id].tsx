// C16 Edit event (screens/event-form.tsx; Phase 2 slice 5, docs/DECISIONS.md #61).

import { useLocalSearchParams } from 'expo-router';

import { RouteIdGuard } from '@/components/route-id-guard';
import { EventFormScreen } from '@/screens/event-form';

/** Route. */
function EditEventRouteContent() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <EventFormScreen eventId={Number(id)} />;
}

/** Checks the address's id before the screen loads anything (D6-07). */
export default function EditEventRoute() {
  return (
    <RouteIdGuard kind="number">
      <EditEventRouteContent />
    </RouteIdGuard>
  );
}
