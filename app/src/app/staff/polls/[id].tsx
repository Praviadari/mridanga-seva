// C17 One poll for staff: results, who voted, Remind, edit, close (screens/poll-detail.tsx).

import { useLocalSearchParams } from 'expo-router';

import { RouteIdGuard } from '@/components/route-id-guard';
import { PollDetailScreen } from '@/screens/poll-detail';

/** Route. */
function StaffPollRouteContent() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PollDetailScreen id={Number(id)} area="staff" />;
}

/** Checks the address's id before the screen loads anything (D6-07). */
export default function StaffPollRoute() {
  return (
    <RouteIdGuard kind="number">
      <StaffPollRouteContent />
    </RouteIdGuard>
  );
}
