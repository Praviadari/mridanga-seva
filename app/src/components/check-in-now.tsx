// "Check {name} in now" on the card after the desk accepts a sign-up or saves a new student (audit phase 5
// U2-01, docs/DECISIONS.md #341): the new student is standing at the desk, so their first visit is
// recorded there and then instead of being forgotten. mark_visit is idempotent (#18): a student already
// in gets "Already checked in. Nothing changed." The phone's position goes with the check-in as on Mark
// attendance (#70); the result card is the same as there.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { markVisit, type MarkOutcome } from '@/data/attendance';
import { locationForCheckIn } from '@/lib/attendance-location';

import { Button } from './button';
import { Notice } from './notice';
import { VisitResultNotice } from './visit-result-notice';

/** Props for CheckInNow. */
export type CheckInNowProps = {
  studentId: string;
  /** The student's name, for the button's label. */
  name: string;
};

/** The button, then what happened. */
export function CheckInNow({ studentId, name }: CheckInNowProps) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<MarkOutcome | null>(null);

  async function checkIn() {
    setBusy(true);
    setOutcome(await markVisit(studentId, 'in', await locationForCheckIn()));
    setBusy(false);
  }

  if (outcome?.result) return <VisitResultNotice result={outcome.result} />;
  return (
    <>
      {outcome?.errorKey ? <Notice tone="error">{t(outcome.errorKey)}</Notice> : null}
      <Button icon="hereNow" label={t('register.checkInNow', { name })} loading={busy} onPress={() => void checkIn()} />
    </>
  );
}
