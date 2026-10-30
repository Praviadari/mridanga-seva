// One challenge template (screens/staff-playground/template-editor.tsx, docs/DECISIONS.md #744).

import { PlaygroundOnly } from '@/components/playground-only';
import { TemplateEditor } from '@/screens/staff-playground/template-editor';

/** Staff route. */
export default function StaffPlaygroundTemplateScreen() {
  return (
    <PlaygroundOnly>
      <TemplateEditor />
    </PlaygroundOnly>
  );
}
