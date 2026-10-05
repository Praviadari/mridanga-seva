// C17 Edit poll (screens/poll-form.tsx; Phase 2 slice 5, docs/DECISIONS.md #61).

import { useLocalSearchParams } from 'expo-router';

import { PollFormScreen } from '@/screens/poll-form';

/** Route. */
export default function EditPollRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PollFormScreen pollId={Number(id)} />;
}
