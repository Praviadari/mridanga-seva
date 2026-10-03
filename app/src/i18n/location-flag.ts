// Words for a flagged check-in (docs/DECISIONS.md #70): the location check at check-in found the
// phone outside the centre's area, or got no position. Used by the result card (C5), "Who is here
// now" (C6), the visit history (S9 for staff) and the reports (C21/G8).

import type { TFunction } from 'i18next';

import { isFlagged, type LocationCheck } from '@/data/attendance';

/** The flagged reasons, in the order the reports list them. */
export const FLAG_REASONS = ['outside', 'refused', 'no_fix', 'no_location'] as const;
export type FlagReason = (typeof FLAG_REASONS)[number];

/**
 * The text for a flagged check-in, or null when it is not flagged. `long` = the sentence for the
 * result card ("… flagged for the facilitator"); otherwise the short label for lists.
 */
export function locationFlagText(
  t: TFunction,
  check: LocationCheck | undefined,
  distanceM: number | null | undefined,
  long = false,
): string | null {
  if (!isFlagged(check)) return null;
  const reason = check as FlagReason;
  const distance = distanceM ?? 0;
  return long ? t(`attendanceLocation.flag.${reason}`, { distance }) : t(`attendanceLocation.short.${reason}`, { distance });
}
