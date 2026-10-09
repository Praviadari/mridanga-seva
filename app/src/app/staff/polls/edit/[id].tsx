// C17 Edit poll (screens/poll-form.tsx; Phase 2 slice 5, docs/DECISIONS.md #61).

import { useLocalSearchParams } from 'expo-router';

import { RouteIdGuard } from '@/components/route-id-guard';
import { PollFormScreen } from '@/screens/poll-form';

/** Route. */
function EditPollRouteContent() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PollFormScreen pollId={Number(id)} />;
}

/** Checks the address's id before the screen loads anything (D6-07). */
export default function EditPollRoute() {
  return (
    <RouteIdGuard kind="number">
      <EditPollRouteContent />
    </RouteIdGuard>
  );
}
