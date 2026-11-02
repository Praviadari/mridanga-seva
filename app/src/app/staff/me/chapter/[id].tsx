// Me > My progress > a chapter (0053, docs/DECISIONS.md #319, #786): the student's chapter screen for a staff
// member's own record; the id is the syllabus item's.

import { RouteIdGuard } from '@/components/route-id-guard';
import { ChapterScreen } from '@/screens/chapter';

/** A chapter of the own record. */
export default function MeChapterScreen() {
  return (
    <RouteIdGuard kind="number">
      <ChapterScreen />
    </RouteIdGuard>
  );
}