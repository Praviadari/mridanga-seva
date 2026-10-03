// G6 Edit assessment (Phase 2, slice 2), for the Guru: the title, instructions, files and link at
// any time; the type, level, level-up flag and rubric only until the first release. The form is
// screens/assessment-form.tsx (docs/DECISIONS.md #45).

import { useLocalSearchParams } from 'expo-router';

import { AssessmentFormScreen } from '@/screens/assessment-form';

/** Edits the assessment `id`. */
export default function EditAssessmentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <AssessmentFormScreen editId={Number(id)} />;
}