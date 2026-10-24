// Face scan (Phase 3 P3-4): one supervised face scan on the student's own phone, for an enrolment
// (docs/DECISIONS.md #311): the camera permission (asked with the class's own words first), the blink/turn
// challenge in a random order (src/face/liveness.ts), then ENROL_FRAMES good pictures, each turned into an
// embedding and a real-face score (src/face/pipeline.ts). Hands the numbers to the screen; keeps nothing.
// A failed challenge offers "Try again" with a new random order. Native only (face-scanner.web.tsx).

import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, StyleSheet, View } from 'react-native';
import { useCameraPermission } from 'react-native-vision-camera';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Notice } from '@/components/notice';

import { type EnrolSample } from './enrolment';
import { FaceCamera, type Captured, type FaceCameraHandle, type FrameReport } from './face-camera';
import { ENROL_FRAME_GAP_MS } from './face-settings';
import {
  challengeKey,
  DEFAULT_CHALLENGE,
  goodForCapture,
  initialChallenge,
  randomSteps,
  stepChallenge,
  type ChallengeKey,
  type ChallengeState,
  type FaceSample,
  type Step,
} from './liveness';
import { analyse } from './pipeline';

export type FaceScannerProps = {
  /** How many pictures to turn into embeddings after the challenge. */
  frames: number;
  /** Called once with the pictures' numbers (never the pictures). */
  onDone: (samples: EnrolSample[]) => void;
  onCancel: () => void;
  /** The self-scan (#345): told each time the blink/turn challenge fails, so the tries are counted. */
  onFailed?: () => void;
};

/** The camera permission, then the scan. */
export function FaceScanner(props: FaceScannerProps) {
  const { t } = useTranslation();
  const permission = useCameraPermission();
  const [asking, setAsking] = useState(false);
  if (permission.hasPermission) return <ScanRun {...props} />;
  return (
    <View style={styles.wrap}>
      <Notice tone="info" title={t('face.camera.title')}>
        {t('face.camera.why')}
      </Notice>
      {permission.canRequestPermission ? (
        <Button
          icon="videoFile"
          label={t('face.camera.allow')}
          loading={asking}
          onPress={() => {
            setAsking(true);
            void permission.requestPermission().finally(() => setAsking(false));
          }}
        />
      ) : (
        <>
          <AppText>{t('face.camera.blocked')}</AppText>
          <Button icon="open" label={t('face.camera.openSettings')} onPress={() => void Linking.openSettings()} />
        </>
      )}
      <Button variant="secondary" label={t('face.scan.cancel')} onPress={props.onCancel} />
    </View>
  );
}

function toSample(r: FrameReport): FaceSample {
  const i = r.info;
  return {
    t: r.t,
    faces: r.faces,
    yaw: i?.yaw ?? 0,
    pitch: i?.pitch ?? 0,
    leftEye: i?.leftEye,
    rightEye: i?.rightEye,
    widthShare: i ? i.box.width / i.frameWidth : 0,
  };
}

/** One run: challenge, then the pictures. A new `key` (Try again) starts a fresh run. */
function ScanRun(props: FaceScannerProps) {
  const [run, setRun] = useState(0);
  return <ScanAttempt key={run} {...props} onRetry={() => setRun((n) => n + 1)} />;
}

type AttemptProps = FaceScannerProps & { onRetry: () => void };

function ScanAttempt({ frames, onDone, onCancel, onFailed, onRetry }: AttemptProps) {
  const { t } = useTranslation();
  const cam = useRef<FaceCameraHandle>(null);
  const [steps] = useState<Step[]>(() => randomSteps());
  const settings = useRef({ ...DEFAULT_CHALLENGE, steps }).current;
  const state = useRef<ChallengeState>(initialChallenge());
  const [prompt, setPrompt] = useState<ChallengeKey>(() => challengeKey(initialChallenge(), steps));
  const [phase, setPhase] = useState<'challenge' | 'pictures' | 'failed' | 'working'>('challenge');
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState(0);
  const samples = useRef<EnrolSample[]>([]);
  const capturing = useRef(false);
  const finished = useRef(false);
  const lastCaptureAt = useRef(0);
  const lastUi = useRef(0);
  const captureMode = useRef<'frame' | 'photo'>('frame');
  const waitingFrame = useRef(0);
  const captureSeq = useRef(0);
  const failures = useRef(0);

  const onCaptured = useCallback(
    async (c: Captured) => {
      if (c.source === 'frame') waitingFrame.current = 0;
      try {
        // Enrolment uses the exact path (landmarks found again on the picture itself).
        const a = await analyse(c.image, c.live, false);
        c.image.dispose();
        samples.current.push({ embedding: a.embedding, realScore: a.realScore });
        setDone(samples.current.length);
        lastCaptureAt.current = Date.now();
        capturing.current = false;
        if (samples.current.length >= frames && !finished.current) {
          finished.current = true;
          setPhase('working');
          onDone(samples.current);
        }
      } catch {
        capturing.current = false;
        failures.current += 1;
        // The frame path failed on this phone: still photos from now on (slower, same result).
        if (c.source === 'frame') captureMode.current = 'photo';
        // Still photos fail too: stop and say so rather than waiting at "picture 0 of 5" for ever (#436).
        else if (failures.current >= 3 && !finished.current) {
          finished.current = true;
          setProblem(t('face.scan.cameraProblem'));
          setPhase('failed');
          onFailed?.();
        }
      }
    },
    [frames, onDone, onFailed, t],
  );

  const tryCapture = useCallback(async () => {
    if (capturing.current || finished.current) return;
    capturing.current = true;
    if (captureMode.current === 'frame') {
      const seq = ++captureSeq.current;
      waitingFrame.current = seq;
      cam.current?.requestFrameCapture();
      setTimeout(() => {
        if (waitingFrame.current === seq && !finished.current) {
          waitingFrame.current = 0;
          captureMode.current = 'photo';
          capturing.current = false;
        }
      }, 3000);
    } else {
      try {
        const c = await cam.current!.capturePhoto();
        await onCaptured(c);
      } catch {
        capturing.current = false;
        setProblem(t('face.scan.cameraProblem'));
      }
    }
  }, [onCaptured, t]);

  const onFrame = useCallback(
    (r: FrameReport) => {
      if (finished.current) return;
      const s = toSample(r);
      const before = state.current;
      state.current = stepChallenge(before, s, settings);
      const st = state.current;
      if (Date.now() - lastUi.current > 120 || st.kind !== before.kind) {
        lastUi.current = Date.now();
        setPrompt(challengeKey(st, steps));
      }
      if (st.kind === 'failed') {
        finished.current = true;
        setPhase('failed');
        onFailed?.();
        return;
      }
      if (st.kind !== 'passed') return;
      if (before.kind !== 'passed') setPhase('pictures');
      if (goodForCapture(s, settings) && Date.now() - lastCaptureAt.current > ENROL_FRAME_GAP_MS) void tryCapture();
    },
    [onFailed, settings, steps, tryCapture],
  );

  return (
    <View style={styles.wrap}>
      <FaceCamera
        ref={cam}
        active={phase === 'challenge' || phase === 'pictures'}
        onFrame={onFrame}
        onCaptured={(c) => void onCaptured(c)}
        onError={() => setProblem(t('face.scan.cameraProblem'))}
      />
      <AppText variant="subtitle" style={styles.prompt} accessibilityLiveRegion="polite">
        {phase === 'working'
          ? t('face.scan.working')
          : phase === 'pictures'
            ? t('face.scan.holdStill', { done, total: frames })
            : t(prompt)}
      </AppText>
      {problem ? <Notice tone="error">{problem}</Notice> : null}
      {phase === 'failed' ? <Button icon="refresh" label={t('face.scan.tryAgain')} onPress={onRetry} /> : null}
      <Button variant="secondary" label={t('face.scan.cancel')} onPress={onCancel} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  prompt: { textAlign: 'center' },
});
