// About you for a login that waits for the desk (step 2 of joining, docs/DECISIONS.md #164): opened
// once by itself after the first sign-in and from the waiting screen (src/app/pending.tsx). The form
// is shared with the student's (src/screens/about-you.tsx).

import { AboutYouScreen } from '@/screens/about-you';

/** About you on the waiting login's own stack. */
export default function PendingAboutYou() {
  return <AboutYouScreen home="/pending" standalone />;
}
