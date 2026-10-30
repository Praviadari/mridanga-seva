// The Rhythm Playground home (screens/playground/home.tsx, docs/DECISIONS.md #730).

import { PlaygroundOnly } from '@/components/playground-only';
import { PlaygroundHome } from '@/screens/playground/home';

/** Student route. */
export default function StudentPlaygroundScreen() {
  return (
    <PlaygroundOnly>
      <PlaygroundHome />
    </PlaygroundOnly>
  );
}
