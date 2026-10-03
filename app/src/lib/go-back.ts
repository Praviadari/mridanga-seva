// Every "Back" button in the app goes through here. A screen opened from a push notification, a
// link or a reload has no screen behind it in its stack; router.back() then has nowhere to go
// (on Android it can leave a blank screen), so such a screen goes to a sensible parent instead.

import { router, type Href } from 'expo-router';

/** Goes back when there is a screen to go back to, else replaces this screen with `parent`. */
export function goBackOr(parent: Href): void {
  if (router.canGoBack()) router.back();
  else router.replace(parent);
}
