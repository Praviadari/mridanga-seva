// V3 Lesson-video player for a login waiting for the desk (screens/lesson-player.tsx; 0057, docs/DECISIONS.md #510):
// the database opens only the Beginner lesson videos to it.

import { RouteIdGuard } from '@/components/route-id-guard';
import { LessonPlayer } from '@/screens/lesson-player';

/** Checks the address's id before the screen loads anything (D6-07). */
export default function WaitingLessonScreen() {
  return (
    <RouteIdGuard kind="number">
      <LessonPlayer />
    </RouteIdGuard>
  );
}
