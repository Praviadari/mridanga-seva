// C17 One poll for staff: results, who voted, Remind, edit, close (screens/poll-detail.tsx).

import { useLocalSearchParams } from 'expo-router';

import { PollDetailScreen } from '@/screens/poll-detail';

/** Route. */
export default function StaffPollRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PollDetailScreen id={Number(id)} area="staff" />;
}
