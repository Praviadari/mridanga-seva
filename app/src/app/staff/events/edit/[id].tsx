// C16 Edit event (screens/event-form.tsx; Phase 2 slice 5, docs/DECISIONS.md #61).

import { useLocalSearchParams } from 'expo-router';

import { EventFormScreen } from '@/screens/event-form';

/** Route. */
export default function EditEventRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <EventFormScreen eventId={Number(id)} />;
}
