// I2 One theme for a public subscriber (screens/ishtagoshti-theme.tsx; docs/DECISIONS.md #88).

import { RouteIdGuard } from '@/components/route-id-guard';
import { IshtagoshtiTheme } from '@/screens/ishtagoshti-theme';

/** Subscriber route of I2. */
function SubscriberIshtagoshtiThemeScreenContent() {
  return <IshtagoshtiTheme area="subscriber" />;
}

/** Checks the address's id before the screen loads anything (D6-07). */
export default function SubscriberIshtagoshtiThemeScreen() {
  return (
    <RouteIdGuard kind="number">
      <SubscriberIshtagoshtiThemeScreenContent />
    </RouteIdGuard>
  );
}
