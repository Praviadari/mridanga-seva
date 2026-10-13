// S3 My QR card opened from My profile (docs/DECISIONS.md #301). Opening the My QR tab's own address
// from a screen on top of the tabs makes a second copy of the tabs, and Back lands on that copy's Home
// (audit R4-01); this address opens the same card on top, so Back returns to My profile. The page is
// the tab's ((tabs)/my-qr.tsx).

import MyQrScreen from './(tabs)/my-qr';

/** My QR card, on top of My profile. */
export default function MyQrOnTopScreen() {
  return <MyQrScreen />;
}
