// I2 One theme for the staff area (screens/ishtagoshti-theme.tsx; docs/DECISIONS.md #57).

import { RouteIdGuard } from '@/components/route-id-guard';
import { IshtagoshtiTheme } from '@/screens/ishtagoshti-theme';

/** Staff route of I2. */
function StaffIshtagoshtiThemeScreenContent() {
  return <IshtagoshtiTheme area="staff" />;
}

/** Checks the address's id before the screen loads anything (D6-07). */
export default function StaffIshtagoshtiThemeScreen() {
  return (
    <RouteIdGuard kind="number">
      <StaffIshtagoshtiThemeScreenContent />
    </RouteIdGuard>
  );
}
