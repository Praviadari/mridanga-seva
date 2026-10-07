// About you for a student (step 2 of joining, docs/DECISIONS.md #164): opened once by itself after
// the first sign-in (S1, src/lib/about-prompt.ts) and from My profile. The form is shared with the
// waiting screen (src/screens/about-you.tsx).

import { AboutYouScreen } from '@/screens/about-you';

/** About you, inside the student's screens. */
export default function StudentAboutYou() {
  return <AboutYouScreen home="/student" standalone={false} />;
}
