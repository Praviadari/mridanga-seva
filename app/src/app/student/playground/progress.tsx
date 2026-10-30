// My Playground progress (screens/playground/progress.tsx, docs/DECISIONS.md #735).

import { PlaygroundOnly } from '@/components/playground-only';
import { PlaygroundProgress } from '@/screens/playground/progress';

/** Student route. */
export default function StudentPlaygroundProgressScreen() {
  return (
    <PlaygroundOnly>
      <PlaygroundProgress />
    </PlaygroundOnly>
  );
}
