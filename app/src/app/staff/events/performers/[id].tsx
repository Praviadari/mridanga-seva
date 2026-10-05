// C16 Performers of an event (screens/event-students.tsx; Phase 2 slice 5, docs/DECISIONS.md #61).

import { useLocalSearchParams } from 'expo-router';

import { EventStudentsScreen } from '@/screens/event-students';

/** Route. */
export default function EventPerformersRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <EventStudentsScreen id={Number(id)} mode="performers" />;
}
