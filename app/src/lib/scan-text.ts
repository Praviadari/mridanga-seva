// What a QR code read by the app's scanners holds (docs/DECISIONS.md #159): a student's attendance
// code (MS1:<qr_token>, DECISIONS #17), an asset label's link (/i/<asset_token>, 0035), or
// something else (a payment QR, a web link of another site).

import { qrTokenFromScan } from '@/data/attendance';

import { assetTokenFromScan } from './asset-link';

export type ScanText = { kind: 'student'; token: string } | { kind: 'asset'; token: string } | { kind: 'other' };

/** Sorts scanned text into a student code, an asset label or neither. */
export function readScanText(text: string): ScanText {
  const asset = assetTokenFromScan(text);
  if (asset) return { kind: 'asset', token: asset };
  const student = qrTokenFromScan(text);
  if (student) return { kind: 'student', token: student };
  return { kind: 'other' };
}
