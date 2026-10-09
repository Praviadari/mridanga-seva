// S12 One poll for a student: vote, results (screens/poll-detail.tsx; Phase 2 slice 5, docs/DECISIONS.md #61).

import { useLocalSearchParams } from 'expo-router';

import { RouteIdGuard } from '@/components/route-id-guard';
import { PollDetailScreen } from '@/screens/poll-detail';

/** Route. */
function StudentPollRouteContent() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PollDetailScreen id={Number(id)} area="student" />;
}

/** Checks the address's id before the screen loads anything (D6-07). */
export default function StudentPollRoute() {
  return (
    <RouteIdGuard kind="number">
      <StudentPollRouteContent />
    </RouteIdGuard>
  );
}
