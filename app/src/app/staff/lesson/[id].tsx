// V3 Lesson-video player for staff (screens/lesson-player.tsx; Phase 2 slice 4, docs/DECISIONS.md #56).

import { RouteIdGuard } from '@/components/route-id-guard';
import { LessonPlayer } from '@/screens/lesson-player';

/** Staff route of V3; the id is the material's. */
function StaffLessonScreenContent() {
  return <LessonPlayer />;
}

/** Checks the address's id before the screen loads anything (D6-07). */
export default function StaffLessonScreen() {
  return (
    <RouteIdGuard kind="number">
      <StaffLessonScreenContent />
    </RouteIdGuard>
  );
}
