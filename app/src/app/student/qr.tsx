// S3 My QR card opened from My profile (docs/DECISIONS.md #301). Opening the My QR tab's own address
// from a screen on top of the tabs makes a second copy of the tabs, and Back lands on that copy's Home
// (audit R4-01); this address opens the same card on top, so Back returns to My profile. The page is
// My QR's own (my-qr.tsx; a tab until #670).

import MyQrScreen from './my-qr';

/** My QR card, on top of My profile. */
export default function MyQrOnTopScreen() {
  return <MyQrScreen />;
}
