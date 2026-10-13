// Face scan (Phase 3 P3-3): the hidden developer screen's working part (docs/DECISIONS.md #312) — proves on a
// phone that the native chain of the Phase 3 APK runs: the three models load, the front camera streams, ML Kit
// finds the face on every frame (numbers shown live), and one picture becomes an SFace embedding and a
// MiniFASNet real-face score, with the time of each step. In memory only: nothing is saved or sent; the last
// embedding is kept only to show the cosine of the next picture against it (same person ≈ 0.8, others < 0.35).
// Native only (face-dev-panel.web.tsx).

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking } from 'react-native';
import { useCameraPermission } from 'react-native-vision-camera';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Notice } from '@/components/notice';
import { Section } from '@/components/section';

import { FaceCamera, type Captured, type FaceCameraHandle, type FrameReport } from './face-camera';
import { cosine } from './face-math';
import { FACE_MODEL_VERSION } from './face-settings';
import { analyse, loadModels } from './pipeline';

type Result = { line: string; embedding: Float32Array };

export function FaceDevPanel() {
  const { t } = useTranslation();
  const permission = useCameraPermission();
  const cam = useRef<FaceCameraHandle>(null);
  const [models, setModels] = useState<string>('…');
  const [live, setLive] = useState('');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const lastUi = useRef(0);
  const wanted = useRef(0);

  useEffect(() => {
    void loadModels()
      .then((m) => setModels(`${FACE_MODEL_VERSION} · ${m.loadMs} ms · ${m.layout.sface}/${m.layout.fas}`))
      .catch((e: unknown) => setModels(`load failed: ${String(e)}`));
  }, []);

  const onFrame = useCallback((r: FrameReport) => {
    if (Date.now() - lastUi.current < 200) return;
    lastUi.current = Date.now();
    const i = r.info;
    setLive(
      `faces ${r.faces} · detect ${r.detectMs} ms · ${r.frame.width}x${r.frame.height} ${r.frame.orientation}${r.frame.mirrored ? ' mirrored' : ''}` +
        (i ? ` · yaw ${i.yaw.toFixed(0)} pitch ${i.pitch.toFixed(0)} · eyes ${(i.leftEye ?? -1).toFixed(2)}/${(i.rightEye ?? -1).toFixed(2)}` : ''),
    );
  }, []);

  const onCaptured = useCallback(async (c: Captured) => {
    try {
      const a = await analyse(c.image, c.live, false);
      c.image.dispose();
      const total = Date.now() - c.frameT;
      setResults((rows) => {
        const prev = rows[0];
        const vs = prev ? ` · cosine to previous ${cosine(a.embedding, prev.embedding).toFixed(3)}` : '';
        const steps = Object.entries({ convert: c.convertMs, ...a.timings })
          .map(([k, v]) => `${k} ${v}`)
          .join(', ');
        const line = `${c.source}/${a.path} ${a.imageSize}: ${total} ms (${steps}) · real ${a.realScore.toFixed(2)}${vs}`;
        return [{ line, embedding: a.embedding }, ...rows].slice(0, 5);
      });
    } catch (e) {
      setProblem(String(e));
    } finally {
      setBusy(false);
      wanted.current = 0;
    }
  }, []);

  if (!permission.hasPermission) {
    return (
      <>
        <Notice tone="info">{t('face.camera.why')}</Notice>
        {permission.canRequestPermission ? (
          <Button label={t('face.camera.allow')} onPress={() => void permission.requestPermission()} />
        ) : (
          <Button label={t('face.camera.openSettings')} onPress={() => void Linking.openSettings()} />
        )}
      </>
    );
  }

  return (
    <>
      <Section icon="construction" title={t('face.dev.models')}>
        <AppText variant="small">{models}</AppText>
      </Section>
      <FaceCamera ref={cam} active onFrame={onFrame} onCaptured={(c) => void onCaptured(c)} onError={setProblem} />
      <AppText variant="small" accessibilityLiveRegion="polite">
        {live}
      </AppText>
      {problem ? <Notice tone="error">{problem}</Notice> : null}
      <Button
        icon="face"
        label={t('face.dev.capture')}
        loading={busy}
        onPress={() => {
          setProblem(null);
          setBusy(true);
          wanted.current = Date.now();
          cam.current?.requestFrameCapture();
        }}
      />
      <Button
        variant="secondary"
        label={t('face.dev.photo')}
        disabled={busy}
        onPress={() => {
          setProblem(null);
          setBusy(true);
          void cam.current
            ?.capturePhoto()
            .then(onCaptured)
            .catch((e: unknown) => {
              setProblem(String(e));
              setBusy(false);
            });
        }}
      />
      {results.map((r, i) => (
        <AppText key={i} variant="small">
          {r.line}
        </AppText>
      ))}
    </>
  );
}
