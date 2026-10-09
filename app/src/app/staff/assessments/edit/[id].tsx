// G6 Edit assessment (Phase 2, slice 2), for the Guru: the title, instructions, files and link at
// any time; the type, level, level-up flag and rubric only until the first release. The form is
// screens/assessment-form.tsx (docs/DECISIONS.md #53).

import { useLocalSearchParams } from 'expo-router';

import { RouteIdGuard } from '@/components/route-id-guard';
import { AssessmentFormScreen } from '@/screens/assessment-form';

/** Edits the assessment `id`. */
function EditAssessmentScreenContent() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <AssessmentFormScreen editId={Number(id)} />;
}

/** Checks the address's id before the screen loads anything (D6-07). */
export default function EditAssessmentScreen() {
  return (
    <RouteIdGuard kind="number">
      <EditAssessmentScreenContent />
    </RouteIdGuard>
  );
}
