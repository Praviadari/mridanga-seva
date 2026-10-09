// I2 One theme for the student area (screens/ishtagoshti-theme.tsx; docs/DECISIONS.md #57).

import { RouteIdGuard } from '@/components/route-id-guard';
import { IshtagoshtiTheme } from '@/screens/ishtagoshti-theme';

/** Student route of I2. */
function StudentIshtagoshtiThemeScreenContent() {
  return <IshtagoshtiTheme area="student" />;
}

/** Checks the address's id before the screen loads anything (D6-07). */
export default function StudentIshtagoshtiThemeScreen() {
  return (
    <RouteIdGuard kind="number">
      <StudentIshtagoshtiThemeScreenContent />
    </RouteIdGuard>
  );
}
