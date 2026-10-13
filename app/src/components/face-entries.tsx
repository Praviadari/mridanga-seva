// Face scan (Phase 3, docs/DECISIONS.md #307-#312): where the face screens are reached. Every entry is hidden
// unless the server's switch is on (face_enabled, default off) — so today nobody sees anything face-related —
// and on the web, which has no face scan. One exception: a student whose phone still keeps a face code sees
// the row even while the switch is off, so they can always turn face scan off.
// - FaceProfileSection: My profile, for a student → S15 Face scan.
// - FaceReEnrolNotice: the student home, when the enrolment ends within 30 days.
// - FaceDevSection: My profile, for staff, on a TEST (preview) build only → the hidden developer screen.
// - FaceDeskEntry: the student's profile (C8), for staff → C25 Face scan at the desk (also on the web: no camera).
// - FaceCountsEntry: Reports (C21/G8), for staff → C27 Face scan use (counts per centre, P3-6).
// The self-scan's "Check in" / "Check out" circle on the student home is src/face/use-self-scan.ts (S16).

import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Notice } from '@/components/notice';
import { Section } from '@/components/section';
import { fetchFaceSwitch } from '@/data/face';
import { expiresSoon, faceView } from '@/face/enrolment';
import { faceDevAllowed } from '@/face/face-dev-flag';
import { EXPIRY_PROMPT_DAYS } from '@/face/face-settings';
import { useFaceStatus } from '@/face/face-status';
import { FACE_SCAN_SUPPORTED } from '@/face/face-store';
import { formatDate, localDate } from '@/lib/dates';

/** My profile (student): the Face scan row, with this phone's state. */
export function FaceProfileSection({ profileId }: { profileId: string }) {
  const { t } = useTranslation();
  const status = useFaceStatus(FACE_SCAN_SUPPORTED ? profileId : undefined);
  if (!FACE_SCAN_SUPPORTED || !status) return null;
  const on = status.server?.face_enabled === true;
  if (!on && !status.stored) return null;
  const view = faceView(status.stored, status.server, status.checkedAt, EXPIRY_PROMPT_DAYS);
  const line =
    view.kind === 'on'
      ? view.expiresAt
        ? t('face.on.until', { date: formatDate(localDate(view.expiresAt)) })
        : t('face.on.title')
      : view.kind === 'code'
        ? t('face.code.title')
        : t('face.profile.off');
  return (
    <Section icon="face" title={t('face.title')}>
      <AppText>{line}</AppText>
      <Button variant="secondary" icon="face" label={t('face.profile.open')} onPress={() => router.push('/student/face-scan')} />
    </Section>
  );
}

/** Student home: "Your face scan ends on …; scan again at the desk", 30 days before the end. */
export function FaceReEnrolNotice({ profileId }: { profileId: string | undefined }) {
  const { t } = useTranslation();
  const status = useFaceStatus(FACE_SCAN_SUPPORTED ? profileId : undefined);
  const enrolled = status?.stored?.enrolled;
  if (!FACE_SCAN_SUPPORTED || !enrolled || status?.server?.face_enabled !== true) return null;
  if (!status || !expiresSoon(enrolled.expiresAt, status.checkedAt, EXPIRY_PROMPT_DAYS)) return null;
  return (
    <>
      <Notice tone="info" title={t('face.reEnrol.title')}>
        {t('face.reEnrol.home', { date: enrolled.expiresAt ? formatDate(localDate(enrolled.expiresAt)) : '' })}
      </Notice>
      <Button variant="secondary" icon="face" label={t('face.profile.open')} onPress={() => router.push('/student/face-scan')} />
    </>
  );
}

/** My profile (staff): the developer screen's row, only on a TEST build with the switch on. */
export function FaceDevSection() {
  const { t } = useTranslation();
  const [on, setOn] = useState(false);
  const allowed = FACE_SCAN_SUPPORTED && faceDevAllowed();
  useEffect(() => {
    if (allowed) void fetchFaceSwitch().then(setOn);
  }, [allowed]);
  if (!allowed || !on) return null;
  return (
    <Section icon="construction" title={t('face.dev.title')} description={t('face.dev.hint')}>
      <Button variant="secondary" icon="face" label={t('face.dev.open')} onPress={() => router.push('/staff/face-dev')} />
    </Section>
  );
}

/** Reports (C21/G8): "Face scan use" (C27), the counts per centre, while the switch is on. Works on the web too. */
export function FaceCountsEntry() {
  const { t } = useTranslation();
  const [on, setOn] = useState(false);
  useEffect(() => {
    void fetchFaceSwitch().then(setOn);
  }, []);
  if (!on) return null;
  return (
    <Section icon="face" title={t('faceCounts.title')} description={t('faceCounts.entryHint')}>
      <Button variant="secondary" icon="face" label={t('faceCounts.open')} onPress={() => router.push('/staff/face-counts')} />
    </Section>
  );
}

/** The student's profile (C8): "Face scan at the desk", while the switch is on. Works on the web too (no camera). */
export function FaceDeskEntry({ studentId, name, rollNo, minor }: { studentId: string; name: string; rollNo: string | null; minor: boolean }) {
  const { t } = useTranslation();
  const [on, setOn] = useState(false);
  useEffect(() => {
    void fetchFaceSwitch().then(setOn);
  }, []);
  if (!on) return null;
  return (
    <Section icon="face" title={t('face.title')} description={t('face.desk.entryHint')}>
      <Button
        variant="secondary"
        icon="face"
        label={t('face.desk.title')}
        onPress={() =>
          router.push({ pathname: '/staff/face/[id]', params: { id: studentId, name, roll: rollNo ?? '', minor: minor ? '1' : '0' } })
        }
      />
    </Section>
  );
}