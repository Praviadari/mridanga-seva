// S9 Attendance history of one student, for coordinators and the Guru: the same list the
// student sees (src/screens/visit-history.tsx), opened from C8 Student profile ("All visits").
// `name` in the address is the student's name and roll number, shown at the top.

import { useLocalSearchParams } from 'expo-router';

import { RouteIdGuard } from '@/components/route-id-guard';
import { VisitHistoryScreen } from '@/screens/visit-history';

/** A student's visits by month. */
function StudentVisitsScreenContent() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  return <VisitHistoryScreen studentId={id} subtitle={name} />;
}

/** Checks the address's id before the screen loads anything (D6-07). */
export default function StudentVisitsScreen() {
  return (
    <RouteIdGuard kind="uuid">
      <StudentVisitsScreenContent />
    </RouteIdGuard>
  );
}
