// S12 One poll for a student: vote, results (screens/poll-detail.tsx; Phase 2 slice 5, docs/DECISIONS.md #61).

import { useLocalSearchParams } from 'expo-router';

import { PollDetailScreen } from '@/screens/poll-detail';

/** Route. */
export default function StudentPollRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PollDetailScreen id={Number(id)} area="student" />;
}
