// Me > My QR (0061, docs/DECISIONS.md #319): a staff member's own student record's card, the student's S3 page
// (student/(tabs)/my-qr.tsx). Saved on the phone, so it works at the door without internet (#21). A colleague
// scans it; scanning one's own code is refused (own_record).

import MyQrScreen from '../../student/(tabs)/my-qr';

/** My QR card of the own record, on top of Me. */
export default function MeQrScreen() {
  return <MyQrScreen />;
}