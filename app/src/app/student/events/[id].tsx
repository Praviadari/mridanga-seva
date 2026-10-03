// S11 One event for a student: answer, add to calendar (screens/event-detail.tsx; docs/DECISIONS.md #57).

import { useLocalSearchParams } from 'expo-router';

import { EventDetailScreen } from '@/screens/event-detail';

/** Route. */
export default function StudentEventRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <EventDetailScreen id={Number(id)} area="student" />;
}
