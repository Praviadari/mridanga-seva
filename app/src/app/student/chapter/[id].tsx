// The chapter screen for students (screens/chapter.tsx, docs/DECISIONS.md #786); the id is the syllabus item's.

import { RouteIdGuard } from '@/components/route-id-guard';
import { ChapterScreen } from '@/screens/chapter';

/** Student route of the chapter screen. */
export default function StudentChapterScreen() {
  return (
    <RouteIdGuard kind="number">
      <ChapterScreen />
    </RouteIdGuard>
  );
}