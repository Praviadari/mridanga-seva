// Face spike (P3-0, never merged): one scan run — enrol a volunteer, check a volunteer (genuine attempt) or
// try an attack (printed photo / phone screen) against a volunteer's template. Logs one result row with
// scores and timings; never keeps a picture.

import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { cosine } from './face-math';
import { FaceCamera, type Captured, type FaceCameraHandle, type FrameReport } from './face-camera';
import {
  challengeText,
  DEFAULT_CHALLENGE,
  goodForCapture,
  initialChallenge,
  randomSteps,
  stepChallenge,
  type ChallengeState,
  type FaceSample,
  type Step,
} from './liveness';
import { analyse, MODEL_VERSION, type Analysis } from './pipeline';
import { addResult, loadTemplates, saveTemplate, type ResultRow } from './store';
import { readRssMb } from './device-info';

export type ScanKind = 'enrol' | 'check' | 'attack';
export type AttackType = NonNullable<ResultRow['attack']>;

export type SpikeSettings = {
  matchThreshold: number;
  liveThreshold: number;
  challenge: boolean;
  fastPath: boolean;
  capture: 'frame' | 'photo';
  enrolFrames: number;
};

export const DEFAULT_SETTINGS: SpikeSettings = {
  matchThreshold: 0.45,
  liveThreshold: 0.8,
  challenge: true,
  fastPath: true,
  capture: 'frame',
  enrolFrames: 5,
};

type Props = {
  kind: ScanKind;
  code: string;
  attack?: AttackType;
  settings: SpikeSettings;
  onFinished: (summary: string) => void;
  onCancel: () => void;
};

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

export function ScanScreen({ kind, code, attack, settings, onFinished, onCancel }: Props) {
  const cam = useRef<FaceCameraHandle>(null);
  const [steps] = useState<Step[]>(() => randomSteps());
  const challengeSettings = { ...DEFAULT_CHALLENGE, steps };
  const useChallenge = settings.challenge;

  const state = useRef<ChallengeState>(useChallenge ? initialChallenge() : { kind: 'passed', ms: 0, at: 0 });
  const [text, setText] = useState(() => (useChallenge ? challengeText(initialChallenge(), steps) : 'Look at the camera'));
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const embeddings = useRef<Analysis[]>([]);
  const capturing = useRef(false);
  const lastCaptureAt = useRef(0);
  const finished = useRef(false);
  const lastUi = useRef(0);
  const lastFrame = useRef<FrameReport | null>(null);
  const captureMode = useRef(settings.capture);

  const note = useCallback((line: string) => setLog((l) => [...l.slice(-6), line]), []);

  const finish = useCallback(
    async (analyses: Analysis[], extra: Partial<ResultRow>) => {
      if (finished.current) return;
      finished.current = true;
      const st = state.current;
      const challenge: ResultRow['challenge'] = !useChallenge ? 'skipped' : st.kind === 'passed' ? 'passed' : 'failed';
      const base: ResultRow = {
        at: new Date().toISOString(),
        kind,
        code,
        attack,
        challenge,
        challengeMs: st.kind === 'passed' && useChallenge ? st.ms : undefined,
        failReason: st.kind === 'failed' ? st.reason : undefined,
        matchThreshold: settings.matchThreshold,
        liveThreshold: settings.liveThreshold,
        rssMb: readRssMb() ?? undefined,
        ...extra,
      };
      if (kind === 'enrol') {
        if (analyses.length === 0) {
          addResult({ ...base, note: 'no capture' });
          onFinished('Enrolment failed: no good capture.');
          return;
        }
        await saveTemplate(code, MODEL_VERSION, analyses.map((a) => a.embedding));
        const a = analyses[analyses.length - 1];
        const selfScores = analyses.map((x) => cosine(x.embedding, analyses[0].embedding));
        addResult({ ...base, realScore: a.realScore, fasA: a.fasA, fasB: a.fasB, path: a.path, imageSize: a.imageSize, timings: a.timings, note: `samples ${analyses.length}, self min ${Math.min(...selfScores).toFixed(3)}` });
        onFinished(`Enrolled ${code} from ${analyses.length} pictures. Real-face score ${a.realScore.toFixed(2)}.`);
        return;
      }
      const a = analyses[0];
      if (!a) {
        addResult({ ...base, note: 'no capture' });
        onFinished(`No picture taken (${base.failReason ?? 'no good frame'}). Logged as ${base.challenge}.`);
        return;
      }
      const tpls = await loadTemplates();
      const own = tpls.find((x) => x.code === code);
      const others: Record<string, number> = {};
      for (const x of tpls) if (x.code !== code) others[x.code] = cosine(a.embedding, x.mean);
      const ownScore = own ? cosine(a.embedding, own.mean) : undefined;
      const live = a.realScore >= settings.liveThreshold;
      const match = ownScore !== undefined && ownScore >= settings.matchThreshold;
      const challengeOk = challenge !== 'failed';
      const accepted = live && match && challengeOk;
      addResult({ ...base, realScore: a.realScore, fasA: a.fasA, fasB: a.fasB, ownScore, others, accepted, path: a.path, imageSize: a.imageSize, frameToResultMs: extra.frameToResultMs, timings: a.timings });
      onFinished(
        `${accepted ? 'ACCEPTED' : 'REFUSED'} — match ${ownScore?.toFixed(3) ?? 'no template'} (needs ${settings.matchThreshold}), ` +
          `real-face ${a.realScore.toFixed(2)} (needs ${settings.liveThreshold}), challenge ${challenge}. ` +
          `Frame → result ${extra.frameToResultMs ?? '?'} ms (${a.path}).`,
      );
    },
    [attack, code, kind, onFinished, settings.liveThreshold, settings.matchThreshold, useChallenge],
  );

  const onCaptured = useCallback(
    async (c: Captured) => {
      try {
        const fast = settings.fastPath && kind !== 'enrol' && c.source === 'frame';
        const a = await analyse(c.image, c.live, fast);
        a.timings.convert = c.convertMs;
        a.timings.detectLive = lastFrame.current?.detectMs ?? 0;
        const frameToResultMs = Date.now() - c.frameT;
        c.image.dispose();
        embeddings.current.push(a);
        note(`${c.source}/${a.path}: ${frameToResultMs} ms, real ${a.realScore.toFixed(2)}`);
        lastCaptureAt.current = Date.now();
        capturing.current = false;
        const needed = kind === 'enrol' ? settings.enrolFrames : 1;
        if (embeddings.current.length >= needed) {
          setBusy(true);
          await finish(embeddings.current, { capture: c.source, frameToResultMs });
        }
      } catch (e) {
        capturing.current = false;
        note(`capture failed: ${String(e)}`);
        if (c.source === 'frame' && captureMode.current === 'frame') {
          captureMode.current = 'photo';
          note('switching to photo capture');
        }
      }
    },
    [finish, kind, note, settings.enrolFrames, settings.fastPath],
  );

  const tryCapture = useCallback(async () => {
    if (capturing.current || finished.current) return;
    capturing.current = true;
    if (captureMode.current === 'frame') {
      cam.current?.requestFrameCapture();
      // If no frame comes back within 3 s, fall back to a photo.
      setTimeout(() => {
        if (capturing.current && captureMode.current === 'frame' && !finished.current) {
          captureMode.current = 'photo';
          capturing.current = false;
          note('frame capture timed out, using photo');
        }
      }, 3000);
    } else {
      try {
        const c = await cam.current!.capturePhoto();
        await onCaptured(c);
      } catch (e) {
        capturing.current = false;
        note(`photo failed: ${String(e)}`);
      }
    }
  }, [note, onCaptured]);

  const onFrame = useCallback(
    (r: FrameReport) => {
      lastFrame.current = r;
      if (finished.current) return;
      const s = toSample(r);
      const before = state.current;
      if (useChallenge) state.current = stepChallenge(before, s, challengeSettings);
      const st = state.current;
      if (Date.now() - lastUi.current > 120 || st.kind !== before.kind) {
        lastUi.current = Date.now();
        setText(useChallenge ? challengeText(st, steps) : r.faces === 1 ? 'Hold still' : 'Show your face');
      }
      const readyForCapture = st.kind === 'passed' || (kind === 'attack' && st.kind === 'failed');
      if (!readyForCapture) {
        if (st.kind === 'failed' && kind !== 'attack') void finish([], {});
        return;
      }
      // Attack runs take a picture even after a failed challenge, to log the passive score too.
      const okFrame = kind === 'attack' ? r.faces === 1 && r.info?.points != null : goodForCapture(s, challengeSettings);
      if (okFrame && Date.now() - lastCaptureAt.current > 350) void tryCapture();
    },
    // challengeSettings is rebuilt each render from the fixed `steps`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [finish, kind, steps, tryCapture, useChallenge],
  );

  const title = kind === 'enrol' ? `Enrol ${code}` : kind === 'check' ? `Check ${code}` : `Attack on ${code}: ${attack}`;
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      <FaceCamera ref={cam} active={!busy} onFrame={onFrame} onCaptured={onCaptured} onError={note} />
      <Text style={styles.prompt}>{busy ? 'Working…' : text}</Text>
      {log.map((l, i) => (
        <Text key={i} style={styles.log}>
          {l}
        </Text>
      ))}
      <Pressable style={styles.cancel} onPress={onCancel} accessibilityRole="button">
        <Text style={styles.cancelText}>Cancel</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  title: { fontSize: 18, fontWeight: '700' },
  prompt: { fontSize: 22, fontWeight: '700', textAlign: 'center', paddingVertical: 8 },
  log: { fontSize: 12, color: '#444' },
  cancel: { alignSelf: 'center', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8, borderWidth: 1, borderColor: '#888' },
  cancelText: { fontSize: 16 },
});
