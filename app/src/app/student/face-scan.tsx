// S15 Face scan (Phase 3 P3-4, docs/DECISIONS.md #307-#312): the student turns face scan on, once, at the class
// desk, on their own phone, with a coordinator beside them; or turns it off with one tap. Shown only when the
// server's switch is on (face_enabled) or this phone still keeps a face code (so it can always be turned off);
// opened from My profile. The web app has no face scan: the row is hidden there, and this page only says so.
//
// Turning on: "Turn on face scan" → the server checks the consent and age first (start_face_enrolment, so a
// missing consent is told before the camera opens) → the scan (blink and turn, then 5 pictures; only numbers
// are kept, src/face/face-scanner.tsx) → the face code is saved on this phone, waiting → the phone shows the
// 6-digit code → the coordinator types it on their own phone ("Face scan at the desk") → this page sees the
// confirmation and finishes (enrol_face). The face code never leaves the phone (Gate 2, #295).
// Turning off: remove_face (the face consent ends too) and the face code is deleted from this phone.

import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { enrolFace, startFaceEnrolment, turnMyFaceOff, type FaceErrorCode, type StartedEnrolment } from '@/data/face';
import type { MessageKey } from '@/data/errors';
import {
  enrolmentProblem,
  faceView,
  withEnrolled,
  withoutPending,
  withPending,
  type EnrolSample,
  type ServerFace,
  type StoredFace,
} from '@/face/enrolment';
import { cosine, floatsToBase64, meanTemplate } from '@/face/face-math';
import { FaceScanner } from '@/face/face-scanner';
import {
  CONFIRM_POLL_MS,
  ENROL_FRAMES,
  ENROL_FRAMES_MIN,
  EXPIRY_PROMPT_DAYS,
  FACE_MODEL_VERSION,
  LIVE_SCORE_MIN,
  SELF_MATCH_MIN,
} from '@/face/face-settings';
import { checkFaceStatus, forgetFace, setFaceStatus, useFaceStatus, type FaceStatus } from '@/face/face-status';
import { FACE_SCAN_SUPPORTED, newDeviceKey, writeStoredFace } from '@/face/face-store';
import { formatDate, localDate } from '@/lib/dates';

/** Server refusals that get their own explanation instead of a one-line message. */
const EXPLAINED: readonly FaceErrorCode[] = ['no_face_consent', 'face_too_young', 'face_off'];
/** enrol_face refusals after which the waiting request is over on the server. */
const ENDED: readonly FaceErrorCode[] = ['no_face_request', 'device_mismatch', 'face_confirmation_expired', 'face_model_outdated'];

type Message = { tone: 'error' | 'success' | 'info'; key: MessageKey };

/** The Face scan page. */
export default function FaceScanScreen() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const profileId = profile?.id;
  const status = useFaceStatus(profileId);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState<'start' | 'finish' | 'off' | null>(null);
  // While scanning: the server's request and the device key it was made for.
  const [scanning, setScanning] = useState<(StartedEnrolment & { deviceKey: string }) | null>(null);
  const [refusal, setRefusal] = useState<FaceErrorCode | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [confirmOff, setConfirmOff] = useState(false);

  const stored = status?.stored ?? null;
  const server = status?.server ?? null;
  const view = status ? faceView(stored, server, status.checkedAt, EXPIRY_PROMPT_DAYS) : null;
  // One enrol_face at a time (the poll and "Check now" may both see the confirmation).
  const finishing = useRef(false);

  const save = useCallback(
    async (next: StoredFace | null, answer: ServerFace | null) => {
      if (!profileId) return;
      await writeStoredFace(next);
      setFaceStatus({ profileId, server: answer, stored: next });
    },
    [profileId],
  );

  /** After the coordinator typed the code: records the enrolment, and the waiting face code becomes this phone's. */
  const finish = useCallback(
    async (now: FaceStatus) => {
      const kept = now.stored;
      if (!kept?.pending || finishing.current) return;
      finishing.current = true;
      setBusy('finish');
      const result = await enrolFace(kept.pending.request, kept.deviceKey);
      setBusy(null);
      finishing.current = false;
      if ('errorKey' in result) {
        setMessage({ tone: 'error', key: result.errorKey });
        // The request is over on the server: the waiting face code goes too.
        if (result.code && ENDED.includes(result.code)) await save(withoutPending(kept), now.server);
        return;
      }
      await save(withEnrolled(kept, result.expiresAt), now.server && { ...now.server, enrolled: true, expires_at: result.expiresAt, waiting_request: null, confirmed: false });
      setMessage({ tone: 'success', key: 'face.on.done' });
    },
    [save],
  );

  /** Asks the server (switch, this phone's enrolment, the coordinator's confirmation); finishes when confirmed. */
  const refresh = useCallback(async () => {
    if (!profileId) return;
    const now = await checkFaceStatus(profileId);
    setChecked(true);
    const p = now?.stored?.pending;
    if (now && p && now.server?.confirmed && now.server.waiting_request === p.request) await finish(now);
  }, [finish, profileId]);

  // Each time the page comes into view.
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  // The code is on screen: ask every few seconds whether the coordinator has typed it.
  const waitingRequest = view?.kind === 'code' && !view.expired && !view.confirmed ? view.request : null;
  useEffect(() => {
    if (waitingRequest === null) return;
    const timer = setInterval(() => void refresh(), CONFIRM_POLL_MS);
    return () => clearInterval(timer);
  }, [refresh, waitingRequest]);
  async function turnOn() {
    if (!profileId) return;
    setMessage(null);
    setRefusal(null);
    setBusy('start');
    const deviceKey = stored?.profileId === profileId ? stored.deviceKey : newDeviceKey();
    const result = await startFaceEnrolment(deviceKey, FACE_MODEL_VERSION);
    setBusy(null);
    if ('errorKey' in result) {
      if (result.code && EXPLAINED.includes(result.code)) setRefusal(result.code);
      else setMessage({ tone: 'error', key: result.errorKey });
      return;
    }
    // A new request replaces a waiting one on the server; drop the old waiting code here too.
    if (stored?.pending) await save(withoutPending(stored), server);
    setScanning({ ...result.started, deviceKey });
  }

  async function scanned(samples: EnrolSample[]) {
    const started = scanning;
    setScanning(null);
    if (!started || !profileId) return;
    const mean = samples.length > 0 ? meanTemplate(samples.map((s) => s.embedding)) : null;
    const problem = mean
      ? enrolmentProblem(samples, { minFrames: ENROL_FRAMES_MIN, liveMin: LIVE_SCORE_MIN, selfMin: SELF_MATCH_MIN }, (e) => cosine(e, mean))
      : 'tooFew';
    if (problem || !mean) {
      setMessage({ tone: 'error', key: `face.scan.problem.${problem ?? 'tooFew'}` });
      return;
    }
    await save(withPending(stored, profileId, started.deviceKey, started, floatsToBase64(mean), samples.length, Date.now()), server);
  }

  async function stopWaiting() {
    setMessage(null);
    await save(withoutPending(stored), server);
  }

  async function turnOff() {
    setBusy('off');
    const result = await turnMyFaceOff();
    setBusy(null);
    setConfirmOff(false);
    if ('errorKey' in result) {
      setMessage({ tone: 'error', key: result.errorKey });
      return;
    }
    await forgetFace();
    if (profileId) setFaceStatus({ profileId, server: server && { ...server, enrolled: false, waiting_request: null, confirmed: false }, stored: null });
    setMessage({ tone: 'success', key: 'face.off.done' });
  }

  const header = <Stack.Screen options={{ title: t('face.title') }} />;

  if (!FACE_SCAN_SUPPORTED) {
    return (
      <Screen underHeader>
        {header}
        <Notice tone="info">{t('face.appOnly')}</Notice>
      </Screen>
    );
  }

  if (scanning) {
    return (
      <Screen underHeader>
        {header}
        <FaceScanner frames={ENROL_FRAMES} onDone={(s) => void scanned(s)} onCancel={() => setScanning(null)} />
      </Screen>
    );
  }

  return (
    <Screen underHeader onRefresh={refresh}>
      {header}
      {!view || !checked ? <LoadingCards /> : null}
      {checked && server === null ? <Notice tone="info">{t('face.offline')}</Notice> : null}
      {message ? <Notice tone={message.tone}>{t(message.key)}</Notice> : null}

      {view?.kind === 'off' ? <Notice tone="info">{t('face.off.classOff')}</Notice> : null}

      {view?.kind === 'intro' ? (
        <>
          <Section icon="face" title={t('face.intro.title')}>
            <AppText>{t('face.intro.what')}</AppText>
            <AppText>{t('face.intro.stays')}</AppText>
            <AppText>{t('face.intro.desk')}</AppText>
            <AppText tone="muted">{t('face.intro.qrStays')}</AppText>
          </Section>
          {refusal ? <Refusal code={refusal} /> : null}
          <Button icon="face" label={t('face.intro.turnOn')} loading={busy === 'start'} disabled={server === null} onPress={() => void turnOn()} />
        </>
      ) : null}

      {view?.kind === 'code' ? (
        <Section icon="face" title={view.reEnrol ? t('face.code.titleAgain') : t('face.code.title')}>
          {view.expired ? (
            <>
              <Notice tone="info">{t('face.code.expired')}</Notice>
              <Button icon="refresh" label={t('face.code.startAgain')} loading={busy === 'start'} onPress={() => void turnOn()} />
            </>
          ) : (
            <>
              <AppText>{t('face.code.show')}</AppText>
              <AppText variant="title" accessibilityLabel={view.code ? view.code.split('').join(' ') : undefined} style={{ textAlign: 'center', letterSpacing: 8 }}>
                {view.code ?? '——————'}
              </AppText>
              <AppText tone="muted">{view.confirmed || busy === 'finish' ? t('face.code.finishing') : t('face.code.waiting')}</AppText>
              <Button variant="secondary" icon="refresh" label={t('face.code.checkNow')} onPress={() => void refresh()} />
            </>
          )}
          <Button variant="link" label={t('face.code.stop')} onPress={() => void stopWaiting()} />
        </Section>
      ) : null}

      {view?.kind === 'on' ? (
        <>
          <Section icon="face" title={t('face.on.title')}>
            <AppText>{view.expiresAt ? t('face.on.until', { date: formatDate(localDate(view.expiresAt)) }) : t('face.on.noDate')}</AppText>
            {view.classOff ? <AppText tone="muted">{t('face.on.classOff')}</AppText> : <AppText tone="muted">{t('face.on.how')}</AppText>}
          </Section>
          {view.soon ? (
            <Notice tone="info" title={t('face.reEnrol.title')}>
              {t('face.reEnrol.body')}
            </Notice>
          ) : null}
          {view.soon ? <Button icon="refresh" label={t('face.reEnrol.button')} loading={busy === 'start'} disabled={server === null} onPress={() => void turnOn()} /> : null}
          {refusal ? <Refusal code={refusal} /> : null}
        </>
      ) : null}

      {view?.kind === 'on' || (view?.kind === 'code' && view.reEnrol) ? (
        confirmOff ? (
          <>
            <Notice tone="info" title={t('face.off.confirmTitle')}>
              {t('face.off.confirmBody')}
            </Notice>
            <Button icon="delete" label={t('face.off.confirmYes')} loading={busy === 'off'} onPress={() => void turnOff()} />
            <Button variant="secondary" label={t('face.off.keep')} onPress={() => setConfirmOff(false)} />
          </>
        ) : (
          <Button variant="secondary" icon="delete" label={t('face.off.button')} disabled={server === null} onPress={() => setConfirmOff(true)} />
        )
      ) : null}
    </Screen>
  );
}

/** A refusal with its own explanation: no consent yet (how to give it), too young, switched off. */
function Refusal({ code }: { code: FaceErrorCode }) {
  const { t } = useTranslation();
  if (code === 'no_face_consent') {
    return (
      <Notice tone="info" title={t('face.consentNeeded.title')}>
        {t('face.consentNeeded.body')}
      </Notice>
    );
  }
  return <Notice tone="info">{t(`face.errors.${code}`)}</Notice>;
}
