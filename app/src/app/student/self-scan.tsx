// S16 Self check-in / check-out (Phase 3 P3-5, docs/DECISIONS.md #344-#349): the student checks themself in or
// out with their face, on their own phone, at the class only. Opened from the home's "Check in" / "Check out"
// circle, which shows only while face scan is on, this phone keeps a face code, and (to check in) the centre
// is open (self_scan_state, 0071). The coordinator's way — the printed QR card, My QR, or the roll number at
// the desk — is offered on every step. A staff member's own record opens it under Me (/staff/me/self-scan, #434).
//
// One self-scan, in order (each step refuses at once, never a guess):
//   1. ONE position, in the foreground, at most 8 s (src/face/self-scan-location.ts). A check-in goes on only
//      from inside the centre's area (radius + accuracy; accuracy over 100 m, a mocked position, no position or
//      no internet = refused). A check-out always goes on: outside = saved and flagged.
//   2. The face: blink and turn in a random order, then 3 pictures, each a real face (passive liveness), all
//      one face, matching the face code kept on this phone (src/face/self-scan-rules.ts verifyScan).
//   3. Gate 1: a single-use challenge → a Play Integrity token bound to the login, action, challenge and the
//      location result → verify-integrity → a one-time pass (src/face/integrity.ts, src/data/self-scan.ts).
//   4. self_scan: the server re-checks everything and saves the visit (method face, by the student).
// A failure on the phone is counted per centre and reason, no name (note_self_scan_failure). Three failed
// tries in a day → only the coordinator's way is offered. The web app has no self-scan: it only says so.

import { router, Stack, useLocalSearchParams, usePathname } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import type { MessageKey } from '@/data/errors';
import { fetchSelfScanState, issueChallenge, noteSelfScanFailure, selfScan, verifyIntegrity } from '@/data/self-scan';
import { base64ToFloats } from '@/face/face-math';
import { FaceScanner } from '@/face/face-scanner';
import { LIVE_SCORE_MIN, MATCH_MIN, MAX_SELF_SCAN_TRIES, SELF_MATCH_MIN, VERIFY_FRAMES } from '@/face/face-settings';
import { useFaceStatus } from '@/face/face-status';
import { FACE_SCAN_SUPPORTED } from '@/face/face-store';
import { integrityToken, IntegrityNotConfigured, SELF_SCAN_SUPPORTED } from '@/face/integrity';
import { readOnePosition } from '@/face/self-scan-location';
import {
  addTry,
  countsAsTry,
  faceFailureReason,
  locationAllows,
  locationFailure,
  locationResult,
  matchThreshold,
  selfScanRequestText,
  triesUsedUp,
  verifyScan,
  type LocationResult,
  type PhonePosition,
  type ScanSample,
  type SelfScanAction,
  type SelfScanOutcome,
  type SelfScanState,
  type Tries,
} from '@/face/self-scan-rules';
import { localTime, todayLocal } from '@/lib/dates';
import { ownAreaOf } from '@/lib/own-area';

/** Failed tries today on this phone; memory only (a restart starts again; the server's limits still hold). */
let tries: Tries | null = null;

type Step =
  | { kind: 'locating' }
  | { kind: 'scanning'; position: PhonePosition; location: LocationResult; state: SelfScanState }
  | { kind: 'saving' }
  | { kind: 'done'; outcome: Extract<SelfScanOutcome, { kind: 'in' | 'already_in' | 'out' | 'already_out' }> }
  | { kind: 'refused'; key: MessageKey; params?: Record<string, string | number>; tryAgain: boolean };

/** The self-scan page. */
export default function SelfScanScreen() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const params = useLocalSearchParams<{ action?: string }>();
  const action: SelfScanAction = params.action === 'check_out' ? 'check_out' : 'check_in';
  const status = useFaceStatus(FACE_SCAN_SUPPORTED && SELF_SCAN_SUPPORTED ? profile?.id : undefined);
  const enrolled = status?.stored?.enrolled ?? null;
  const deviceKey = status?.stored?.deviceKey ?? null;
  const [step, setStep] = useState<Step>({ kind: 'locating' });
  const started = useRef(false);

  const refuse = useCallback((key: MessageKey, opts: { counts?: boolean; params?: Record<string, string | number> } = {}) => {
    if (opts.counts) tries = addTry(tries, todayLocal());
    const usedUp = triesUsedUp(tries, todayLocal(), MAX_SELF_SCAN_TRIES);
    setStep({ kind: 'refused', key: usedUp ? 'selfScan.refused.triesUsedUp' : key, params: opts.params, tryAgain: !usedUp && !!opts.counts });
  }, []);

  /** Step 1: the state (open hours, the centre's area), then ONE position. */
  const begin = useCallback(async () => {
    if (!deviceKey) return;
    setStep({ kind: 'locating' });
    if (triesUsedUp(tries, todayLocal(), MAX_SELF_SCAN_TRIES)) {
      refuse('selfScan.refused.triesUsedUp');
      return;
    }
    const state = await fetchSelfScanState(deviceKey);
    if (!state) {
      refuse('selfScan.refused.offline');
      return;
    }
    // This phone must keep the confirmed face code too (a phone with only a waiting one has nothing to match).
    if (!state.faceEnabled || !state.enrolled || state.blocked || !enrolled) {
      refuse('selfScan.refused.notAvailable');
      return;
    }
    if (action === 'check_in' && !state.openNow) {
      refuse('selfScan.refused.window', { params: { opens: state.opensAt ?? '', closes: state.closesAt ?? '' } });
      return;
    }
    const position = await readOnePosition();
    const { result } = locationResult(position, state.centre);
    if (!locationAllows(action, result)) {
      const failure = locationFailure(result);
      if (failure) void noteSelfScanFailure(failure.reason, failure.detail);
      refuse(`selfScan.refused.location.${result}` as MessageKey);
      return;
    }
    setStep({ kind: 'scanning', position, location: result, state });
  }, [action, deviceKey, enrolled, refuse]);

  useEffect(() => {
    if (started.current || !deviceKey) return;
    started.current = true;
    void begin();
  }, [begin, deviceKey]);

  /** Steps 2-4: the face decision on the phone, Gate 1, the server's save. */
  async function scanned(samples: ScanSample[], scan: Extract<Step, { kind: 'scanning' }>) {
    if (!enrolled || !deviceKey || !profile) return;
    setStep({ kind: 'saving' });
    const decision = verifyScan(samples, base64ToFloats(enrolled.mean), {
      minFrames: VERIFY_FRAMES,
      liveMin: LIVE_SCORE_MIN,
      selfMin: SELF_MATCH_MIN,
      matchMin: matchThreshold(MATCH_MIN, scan.state.matchMin),
    });
    if (!decision.ok) {
      void noteSelfScanFailure(faceFailureReason(decision.problem));
      refuse(`selfScan.refused.face.${decision.problem}`, { counts: countsAsTry(decision.problem) });
      return;
    }

    const challenge = await issueChallenge(action);
    if ('errorKey' in challenge) {
      refuse(challenge.offline ? 'selfScan.refused.offline' : challenge.errorKey);
      return;
    }
    let token: string;
    try {
      token = await integrityToken(selfScanRequestText(challenge.login, action, challenge.challenge, scan.location));
    } catch (e) {
      refuse(e instanceof IntegrityNotConfigured ? 'selfScan.refused.notConfigured' : 'selfScan.refused.integrity', {
        counts: !(e instanceof IntegrityNotConfigured),
      });
      return;
    }
    const verdict = await verifyIntegrity({ challenge: challenge.challenge, token, action, location: scan.location });
    if (!('pass' in verdict)) {
      refuse(verdict.offline ? 'selfScan.refused.offline' : 'selfScan.refused.integrity', { counts: !verdict.offline });
      return;
    }
    const saved = await selfScan({
      action,
      position: scan.position,
      pass: verdict.pass,
      deviceKey,
      livenessOk: true,
      matchScore: decision.score,
    });
    if ('errorKey' in saved) {
      refuse(saved.offline ? 'selfScan.refused.offline' : saved.errorKey);
      return;
    }
    const outcome = saved.outcome;
    if (outcome.kind === 'refused') {
      const params: Record<string, string | number> =
        outcome.reason === 'window' ? { opens: scan.state.opensAt ?? '', closes: scan.state.closesAt ?? '' } : { minutes: outcome.minutes ?? 10 };
      refuse(`selfScan.refused.server.${outcome.reason}`, { counts: countsAsTry(outcome.reason), params });
      return;
    }
    tries = null;
    setStep({ kind: 'done', outcome });
  }

  const title = t(action === 'check_in' ? 'selfScan.checkIn' : 'selfScan.checkOut');
  const header = <Stack.Screen options={{ title }} />;

  if (!FACE_SCAN_SUPPORTED || !SELF_SCAN_SUPPORTED) {
    return (
      <Screen underHeader>
        {header}
        <Notice tone="info">{t('selfScan.appOnly')}</Notice>
        <AskCoordinator />
      </Screen>
    );
  }

  if (step.kind === 'scanning') {
    const scan = step;
    return (
      <Screen underHeader>
        {header}
        <FaceScanner
          frames={VERIFY_FRAMES}
          onDone={(s) => void scanned(s, scan)}
          onCancel={() => router.back()}
          onFailed={() => {
            // The blink/turn challenge failed: one try. The scanner offers Try again; after the third, only the coordinator.
            void noteSelfScanFailure('liveness');
            tries = addTry(tries, todayLocal());
            if (triesUsedUp(tries, todayLocal(), MAX_SELF_SCAN_TRIES)) refuse('selfScan.refused.triesUsedUp');
          }}
        />
        <AskCoordinator />
      </Screen>
    );
  }

  return (
    <Screen underHeader>
      {header}
      {status && !deviceKey ? <Notice tone="info">{t('selfScan.refused.notAvailable')}</Notice> : null}
      {step.kind === 'locating' && (deviceKey || !status) ? <Notice tone="info">{t('selfScan.locating')}</Notice> : null}
      {step.kind === 'saving' ? <Notice tone="info">{t('selfScan.saving')}</Notice> : null}
      {step.kind === 'done' ? <Done outcome={step.outcome} /> : null}
      {step.kind === 'refused' ? (
        <>
          <Notice tone="error">{t(step.key, step.params)}</Notice>
          {step.tryAgain ? <Button icon="refresh" label={t('selfScan.tryAgain')} onPress={() => void begin()} /> : null}
        </>
      ) : null}
      {step.kind === 'done' ? <Button label={t('selfScan.backHome')} onPress={() => router.back()} /> : <AskCoordinator />}
    </Screen>
  );
}

/** The result of a saved self-scan. */
function Done({ outcome }: { outcome: Extract<Step, { kind: 'done' }>['outcome'] }) {
  const { t } = useTranslation();
  const time = outcome.at ? localTime(outcome.at) : '';
  if (outcome.kind === 'already_in') return <Notice tone="info">{t('selfScan.done.alreadyIn', { time })}</Notice>;
  if (outcome.kind === 'already_out') return <Notice tone="info">{t('selfScan.done.alreadyOut')}</Notice>;
  if (outcome.kind === 'in') {
    return (
      <Notice tone="success" title={t('selfScan.done.inTitle')}>
        {t('selfScan.done.in', { time })}
      </Notice>
    );
  }
  return (
    <>
      <Notice tone="success" title={t('selfScan.done.outTitle')}>
        {t('selfScan.done.out', { time, count: outcome.minutes ?? 0 })}
      </Notice>
      {outcome.flagged ? <Notice tone="info">{t('selfScan.done.flagged')}</Notice> : null}
    </>
  );
}

/** The coordinator's way, on every step (WORK_PLAN P3-5: always offered). */
function AskCoordinator() {
  const { t } = useTranslation();
  const myQr = ownAreaOf(usePathname()) === 'me' ? '/staff/me/qr' : '/student/qr';
  return (
    <Section icon="qr" title={t('selfScan.ask.title')}>
      <AppText>{t('selfScan.ask.body')}</AppText>
      <Button variant="secondary" icon="qr" label={t('selfScan.ask.openQr')} onPress={() => router.replace(myQr)} />
    </Section>
  );
}
