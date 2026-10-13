// C25 Face scan at the desk (Phase 3 P3-4, docs/DECISIONS.md #307-#312): what a coordinator (or the Guru) does
// for one student's face scan, beside the student, on their OWN phone or computer. Opened from the student's
// profile (C8) by "Face scan at the desk", which shows only while the server's switch is on (face_enabled).
// No camera here: the student scans on their own phone (S15); this screen never sees a face code (Gate 2).
// 1. Confirm the code: the 6-digit code on the student's phone after their scan (approve_face_enrolment; never
//    one's own record; 5 wrong codes end the request). The student's phone then finishes by itself.
// 2. Face scan consent: the signed face scan form, recorded once (record_face_consent). A child: the parent
//    who signed, the parent's ID seen, and the child's own yes read out by the coordinator (refused under the
//    minimum age, 18 until the Guru and the lawyer answer).
// 3. The record: the student's enrolments (get_face_enrolments; the read is written to the access log).
// 4. Turn face scan off: "they say no" (the consent ends) or "lost or new phone" (the consent stays).

import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Checkbox } from '@/components/checkbox';
import { ChoiceGroup } from '@/components/choice-group';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { RouteIdGuard } from '@/components/route-id-guard';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { TextField } from '@/components/text-field';
import type { MessageKey } from '@/data/errors';
import {
  approveFaceEnrolment,
  fetchFaceDesk,
  fetchFaceEnrolments,
  fetchFaceSwitch,
  recordFaceConsent,
  removeFaceAtDesk,
  type DeskGuardian,
  type FaceEnrolmentRow,
} from '@/data/face';
import { idTypeName, relationName } from '@/i18n/labels';
import { formatDate, localDate } from '@/lib/dates';

const ID_TYPES = ['aadhaar', 'pan', 'driving_licence', 'passport', 'voter_id', 'other'] as const;

type Said = { tone: 'error' | 'success' | 'info'; text: string } | null;

export default function FaceDeskScreen() {
  return (
    <RouteIdGuard kind="uuid">
      <FaceDeskContent />
    </RouteIdGuard>
  );
}

function FaceDeskContent() {
  const { t } = useTranslation();
  const { id, name, roll, minor: minorParam } = useLocalSearchParams<{ id: string; name?: string; roll?: string; minor?: string }>();
  const minor = minorParam === '1';
  // undefined = loading; false = switched off.
  const [on, setOn] = useState<boolean | undefined>(undefined);
  const [desk, setDesk] = useState<Awaited<ReturnType<typeof fetchFaceDesk>> | undefined>(undefined);

  const load = useCallback(async () => {
    const switchOn = await fetchFaceSwitch();
    setOn(switchOn);
    if (switchOn) setDesk(await fetchFaceDesk(id, minor));
  }, [id, minor]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const header = <Stack.Screen options={{ title: t('face.desk.title') }} />;
  const who = [name, roll].filter(Boolean).join(' · ');

  if (on === undefined) {
    return (
      <Screen underHeader>
        {header}
        <LoadingCards />
      </Screen>
    );
  }
  if (!on) {
    return (
      <Screen underHeader>
        {header}
        <Notice tone="info">{t('face.errors.face_off')}</Notice>
      </Screen>
    );
  }
  return (
    <Screen underHeader onRefresh={load}>
      {header}
      {who ? <AppText variant="subtitle">{who}</AppText> : null}
      <ConfirmCode studentId={id} />
      <ConsentPart studentId={id} minor={minor} desk={desk} onRecorded={load} />
      <RecordPart studentId={id} />
      <TurnOffPart studentId={id} onDone={load} />
    </Screen>
  );
}

/** 1. The 6-digit code from the student's phone. */
function ConfirmCode({ studentId }: { studentId: string }) {
  const { t } = useTranslation();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<Said>(null);

  async function confirm() {
    if (!/^\d{6}$/.test(code)) {
      setSaid({ tone: 'error', text: t('face.desk.codeSixDigits') });
      return;
    }
    setBusy(true);
    const result = await approveFaceEnrolment(studentId, code);
    setBusy(false);
    if ('errorKey' in result) setSaid({ tone: 'error', text: t(result.errorKey) });
    else if (result.state === 'wrongCode') setSaid({ tone: 'error', text: t('face.desk.codeWrong', { count: result.triesLeft }) });
    else {
      setCode('');
      setSaid({ tone: 'success', text: t('face.desk.confirmed', { name: [result.fullName, result.rollNo].filter(Boolean).join(' · ') }) });
    }
  }

  return (
    <Section icon="face" title={t('face.desk.codeTitle')} description={t('face.desk.codeHint')}>
      <TextField
        label={t('face.desk.codeLabel')}
        value={code}
        onChangeText={(text) => setCode(text.replace(/\D/g, '').slice(0, 6))}
        keyboardType="number-pad"
        inputMode="numeric"
        maxLength={6}
        autoComplete="off"
        autoCorrect={false}
      />
      {said ? <Notice tone={said.tone}>{said.text}</Notice> : null}
      <Button icon="check" label={t('face.desk.confirm')} loading={busy} onPress={() => void confirm()} />
    </Section>
  );
}

/** 2. The signed face scan form. */
function ConsentPart({
  studentId,
  minor,
  desk,
  onRecorded,
}: {
  studentId: string;
  minor: boolean;
  desk: Awaited<ReturnType<typeof fetchFaceDesk>> | undefined;
  onRecorded: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [signed, setSigned] = useState(false);
  const [guardian, setGuardian] = useState<string | null>(null);
  const [idType, setIdType] = useState<string | null>(null);
  const [assent, setAssent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<Said>(null);

  async function record() {
    setBusy(true);
    const result = await recordFaceConsent(studentId, { signedForm: signed, guardianId: guardian, idTypeChecked: idType, childAssent: minor ? assent : undefined });
    setBusy(false);
    if ('errorKey' in result) {
      setSaid({ tone: 'error', text: t(result.errorKey) });
      return;
    }
    setSaid({ tone: 'success', text: t('face.desk.consentRecorded') });
    setSigned(false);
    setAssent(false);
    await onRecorded();
  }

  return (
    <Section icon="guardian" title={t('face.desk.consentTitle')} description={minor ? t('face.desk.consentHintMinor') : t('face.desk.consentHint')}>
      {desk === undefined ? <LoadingCards /> : null}
      {desk === null ? <Notice tone="error">{t('common.networkError')}</Notice> : null}
      {desk?.consentGivenAt ? (
        <AppText>{t('face.desk.consentOnRecord', { date: formatDate(localDate(desk.consentGivenAt)) })}</AppText>
      ) : null}
      {desk && !desk.consentGivenAt ? (
        <>
          <AppText tone="muted">{t('face.desk.consentNone')}</AppText>
          <Checkbox label={t('face.desk.signedForm')} checked={signed} onChange={setSigned} />
          {minor ? (
            <>
              <ChoiceGroup<string>
                label={t('face.desk.guardian')}
                choices={desk.guardians.map((g: DeskGuardian) => ({ value: g.id, label: [g.fullName, relationName(t, g.relation)].filter(Boolean).join(' · ') }))}
                value={guardian}
                onChange={setGuardian}
              />
              <ChoiceGroup<string>
                label={t('face.desk.idSeen')}
                chips
                choices={ID_TYPES.map((code) => ({ value: code, label: idTypeName(t, code) }))}
                value={idType}
                onChange={setIdType}
              />
              <Checkbox label={t('face.desk.childAssent')} checked={assent} onChange={setAssent} />
            </>
          ) : null}
          {said ? <Notice tone={said.tone}>{said.text}</Notice> : null}
          <Button icon="check" label={t('face.desk.recordConsent')} loading={busy} onPress={() => void record()} />
        </>
      ) : said ? (
        <Notice tone={said.tone}>{said.text}</Notice>
      ) : null}
    </Section>
  );
}

const STATE_KEYS: Record<FaceEnrolmentRow['state'], MessageKey> = {
  waiting_code: 'face.desk.state.waiting_code',
  confirmed: 'face.desk.state.confirmed',
  current: 'face.desk.state.current',
  expired: 'face.desk.state.expired',
  ended: 'face.desk.state.ended',
};

const REASONS = ['student_off', 'desk', 'lost_phone', 'replaced', 'not_completed', 'code_failed', 'consent_withdrawn', 'withdrawn', 'login_changed', 'login_off', 'left', 'expired', 'model_changed'] as const;

/** How an enrolment ended (face_enrolments.revoke_reason), worded; an unknown one reads as "ended". */
function reasonKey(reason: string): MessageKey {
  return (REASONS as readonly string[]).includes(reason) ? `face.desk.reason.${reason as (typeof REASONS)[number]}` : 'face.desk.state.ended';
}

/** 3. The enrolments, on request (each read is written to the access log). */
function RecordPart({ studentId }: { studentId: string }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<FaceEnrolmentRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<MessageKey | null>(null);

  async function show() {
    setBusy(true);
    const result = await fetchFaceEnrolments(studentId);
    setBusy(false);
    if ('errorKey' in result) setErrorKey(result.errorKey);
    else {
      setErrorKey(null);
      setRows(result.rows);
    }
  }

  return (
    <Section icon="visits" title={t('face.desk.recordTitle')} description={t('face.desk.recordHint')}>
      {rows?.length === 0 ? <AppText tone="muted">{t('face.desk.recordNone')}</AppText> : null}
      {rows?.map((r) => (
        <AppText key={r.id} tone={r.state === 'current' ? 'default' : 'muted'}>
          {t(STATE_KEYS[r.state] ?? 'face.desk.state.ended')}
          {' · '}
          {t('face.desk.requested', { date: formatDate(localDate(r.requestedAt)) })}
          {r.expiresAt && r.state === 'current' ? ` · ${t('face.on.until', { date: formatDate(localDate(r.expiresAt)) })}` : ''}
          {r.revokeReason ? ` · ${t(reasonKey(r.revokeReason))}` : ''}
        </AppText>
      ))}
      {errorKey ? <Notice tone="error">{t(errorKey)}</Notice> : null}
      <Button variant="secondary" icon="refresh" label={rows ? t('face.desk.recordAgain') : t('face.desk.recordShow')} loading={busy} onPress={() => void show()} />
    </Section>
  );
}

/** 4. Face scan off at the desk. */
function TurnOffPart({ studentId, onDone }: { studentId: string; onDone: () => Promise<void> }) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState<'desk' | 'lost_phone' | null>(null);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<Said>(null);

  async function turnOff(reason: 'desk' | 'lost_phone') {
    setBusy(true);
    const result = await removeFaceAtDesk(studentId, reason);
    setBusy(false);
    setConfirming(null);
    if ('errorKey' in result) {
      setSaid({ tone: 'error', text: t(result.errorKey) });
      return;
    }
    setSaid({
      tone: 'success',
      text: reason === 'desk' ? t('face.desk.offDone', { count: result.removed }) : t('face.desk.lostDone', { count: result.removed }),
    });
    await onDone();
  }

  return (
    <Section icon="delete" title={t('face.desk.offTitle')} description={t('face.desk.offHint')}>
      {said ? <Notice tone={said.tone}>{said.text}</Notice> : null}
      {confirming ? (
        <>
          <Notice tone="info">{confirming === 'desk' ? t('face.desk.offConfirm') : t('face.desk.lostConfirm')}</Notice>
          <Button icon="delete" label={t('face.desk.offYes')} loading={busy} onPress={() => void turnOff(confirming)} />
          <Button variant="secondary" label={t('face.off.keep')} onPress={() => setConfirming(null)} />
        </>
      ) : (
        <>
          <Button variant="secondary" icon="delete" label={t('face.desk.offSaysNo')} onPress={() => setConfirming('desk')} />
          <Button variant="secondary" icon="refresh" label={t('face.desk.offLostPhone')} onPress={() => setConfirming('lost_phone')} />
        </>
      )}
    </Section>
  );
}
