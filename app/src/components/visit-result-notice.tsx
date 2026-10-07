// The card that says what just happened after a QR scan or a tap on the attendance screens
// (C5, C6): "Checked in at 16:05", "Checked out, stayed 1 h 45 min", "Already checked in", or
// "Code not recognised". The student's name and roll number are the title, large, so the
// coordinator can see at a glance that the code belonged to the person in front of them.

import { useTranslation } from 'react-i18next';

import type { VisitResult } from '@/data/attendance';
import { formatDuration } from '@/i18n/labels';
import { locationFlagText } from '@/i18n/location-flag';
import { localTime } from '@/lib/dates';

import { Notice } from './notice';

/** Props for VisitResultNotice. */
export type VisitResultNoticeProps = {
  /** What the database reported (src/data/attendance.ts). */
  result: VisitResult;
};

/** Green for a change, plain for "nothing changed", red for an unknown code. */
export function VisitResultNotice({ result }: VisitResultNoticeProps) {
  const { t } = useTranslation();

  if (result.action === 'unknown') {
    return (
      <Notice tone="error" title={t('attendance.unknownTitle')}>
        {t('attendance.unknownBody')}
      </Notice>
    );
  }

  const title = t('attendance.student', { name: result.fullName, rollNo: result.rollNo });
  switch (result.action) {
    case 'in': {
      // A flagged check-in is saved all the same; the card says why it is flagged (DECISIONS #70).
      const flag = locationFlagText(t, result.locationCheck, result.distanceM, true);
      return (
        <Notice tone={flag ? 'info' : 'success'} title={title} announced>
          {flag
            ? `${t('attendance.checkedIn', { time: localTime(result.at) })} ${flag}`
            : t('attendance.checkedIn', { time: localTime(result.at) })}
        </Notice>
      );
    }
    case 'out':
      return (
        <Notice tone="success" title={title}>
          {t('attendance.checkedOut', {
            time: localTime(result.at),
            duration: formatDuration(t, result.minutes),
          })}
        </Notice>
      );
    case 'already_in':
      return (
        <Notice tone="info" title={title} announced>
          {t('attendance.alreadyIn')}
        </Notice>
      );
    case 'already_out':
      return (
        <Notice tone="info" title={title} announced>
          {t('attendance.alreadyOut')}
        </Notice>
      );
  }
}
