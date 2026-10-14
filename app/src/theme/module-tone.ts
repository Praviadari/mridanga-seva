// The module colour of the screen on show (launch UI, docs/DECISIONS.md #354): each module's circle colour on the
// homes carries into that module's own screens, like coloured signs in a temple, so a person knows where they are.
// IconBadge (components/icon.tsx) takes it when no tone is given: the icons of a module's lists, sections and empty
// screens are tinted with it. Homes, the side menu and set-up screens have none (saffron).

import { useSegments } from 'expo-router';

import { moduleToneFor } from '@/lib/module-tone';

import type { ModuleTone } from './colors';

/** The module colour of the screen this component is on, or undefined (saffron). */
export function useModuleTone(): ModuleTone | undefined {
  return moduleToneFor(useSegments());
}
