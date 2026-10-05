// C16 One event for staff: answers by name, Remind, performers, attendance, edit, cancel (screens/event-detail.tsx).

import { useLocalSearchParams } from 'expo-router';

import { EventDetailScreen } from '@/screens/event-detail';

/** Route. */
export default function StaffEventRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <EventDetailScreen id={Number(id)} area="staff" />;
}
