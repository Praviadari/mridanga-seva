// Face scan (Phase 3 P3-3): the "dev flag" of the hidden developer screen (docs/DECISIONS.md #312). The screen
// exists only on a TEST build: a development run, or an APK on the update channel 'preview' (the EAS preview
// profile talks to TEST) or 'facetest' ("Mridanga Seva TEST", the face-scan test app, TEST only; #430). The
// production APK (channel 'production', LIVE) never shows it, whatever the server's switch says. Staff only and switch on are checked where the row is shown (components/face-entries.tsx).

import * as Updates from 'expo-updates';

/** True on a development run or a preview or facetest (TEST) build. */
export function faceDevAllowed(): boolean {
  if (typeof __DEV__ !== 'undefined' && __DEV__) return true;
  return Updates.channel === 'preview' || Updates.channel === 'facetest';
}
