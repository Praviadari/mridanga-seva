// Face spike (P3-0, never merged): the front camera with VisionCamera v5. Every frame goes through ML Kit
// (react-native-vision-camera-face-detector) on the camera's own frame thread; the numbers come back to
// React for the blink/turn challenge. When the screen asks for a capture, the next good frame is turned
// into a picture (VisionCamera's FrameConverter → react-native-nitro-image Image) and handed over; the
// "photo" capture takes a still photo instead (slower, used when the frame path fails on a phone).

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Image } from 'react-native-nitro-image';
import type { NitroModules } from 'react-native-nitro-modules';
import {
  Camera,
  CommonResolutions,
  HybridFrameConverter,
  useCameraPermission,
  useFrameOutput,
  usePhotoOutput,
} from 'react-native-vision-camera';
import { createFaceDetector } from 'react-native-vision-camera-face-detector';
import { createSynchronizable, scheduleOnRN } from 'react-native-worklets';

import { faceInfo, type FaceInfo } from './pipeline';

/** What one frame told us. */
export type FrameReport = {
  t: number; // when detection started on this frame (ms, same clock as Date.now on the JS side)
  faces: number;
  info: FaceInfo | null;
  detectMs: number;
  frame: { width: number; height: number; orientation: string; mirrored: boolean; pixelFormat: string };
};

export type Captured = { image: Image; live: FaceInfo | null; frameT: number; convertMs: number; source: 'frame' | 'photo' };

export type FaceCameraHandle = {
  /** Ask for the next good frame as a picture. */
  requestFrameCapture(): void;
  /** Take a still photo now. */
  capturePhoto(): Promise<Captured>;
};

type Props = {
  active: boolean;
  onFrame: (r: FrameReport) => void;
  onCaptured: (c: Captured) => void;
  onError: (message: string) => void;
};

type Boxed = { unbox(): Image };

export const FaceCamera = forwardRef<FaceCameraHandle, Props>(function FaceCamera({ active, onFrame, onCaptured, onError }, ref) {
  const permission = useCameraPermission();
  useEffect(() => {
    if (!permission.hasPermission && permission.canRequestPermission) void permission.requestPermission();
  }, [permission]);

  // Stable callbacks for the worklet; the latest props are read through refs.
  const props = useRef({ onFrame, onCaptured, onError });
  props.current = { onFrame, onCaptured, onError };
  const last = useRef<FrameReport | null>(null);

  const detector = useMemo(
    () => createFaceDetector({ performanceMode: 'fast', runLandmarks: true, runClassifications: true, cameraFacing: 'front', autoMode: false, minFaceSize: 0.15 }),
    [],
  );
  const wanted = useMemo(() => createSynchronizable(0), []);

  const handlers = useMemo(
    () => ({
      report(r: FrameReport) {
        last.current = r;
        props.current.onFrame(r);
      },
      captured(boxed: Boxed | Image, live: FaceInfo | null, frameT: number, convertMs: number) {
        try {
          const image = 'unbox' in boxed && typeof boxed.unbox === 'function' ? (boxed as Boxed).unbox() : (boxed as Image);
          props.current.onCaptured({ image, live, frameT, convertMs, source: 'frame' });
        } catch (e) {
          props.current.onError(`capture hand-over failed: ${String(e)}`);
        }
      },
      failed(message: string) {
        props.current.onError(message);
      },
    }),
    [],
  );
  const { report, captured, failed } = handlers;

  const frameOutput = useFrameOutput({
    targetResolution: CommonResolutions.VGA_4_3,
    pixelFormat: 'yuv',
    dropFramesWhileBusy: true,
    onFrame: (frame) => {
      'worklet';
      const t = Date.now();
      try {
        const faces = detector.detectFaces(frame);
        const detectMs = Date.now() - t;
        let info: FaceInfo | null = null;
        if (faces.length > 0) {
          let big = faces[0];
          for (let i = 1; i < faces.length; i++) if (faces[i].bounds.width > big.bounds.width) big = faces[i];
          info = faceInfo(big);
        }
        const r: FrameReport = {
          t,
          faces: faces.length,
          info,
          detectMs,
          frame: { width: frame.width, height: frame.height, orientation: frame.orientation, mirrored: frame.isMirrored, pixelFormat: frame.pixelFormat },
        };
        if (wanted.getBlocking() > 0 && faces.length === 1 && info !== null && info.points !== null) {
          wanted.setBlocking(0);
          const t1 = Date.now();
          const image = HybridFrameConverter.convertFrameToImage(frame);
          // Box the picture so the React runtime can unbox it. The proxy is read from this worklet runtime's
          // own global (Nitro installs it per runtime) rather than captured from the React runtime.
          let handOver: Boxed | Image = image;
          try {
            const proxy = (globalThis as unknown as { NitroModulesProxy?: typeof NitroModules }).NitroModulesProxy;
            if (proxy) handOver = proxy.box(image) as unknown as Boxed;
          } catch {
            handOver = image;
          }
          scheduleOnRN(captured, handOver, info, t, Date.now() - t1);
        }
        scheduleOnRN(report, r);
      } catch (e) {
        scheduleOnRN(failed, `frame: ${String(e)}`);
      } finally {
        frame.dispose();
      }
    },
  });

  const photoOutput = usePhotoOutput({ targetResolution: CommonResolutions.HD_4_3, qualityPrioritization: 'speed', containerFormat: 'jpeg' });

  useImperativeHandle(
    ref,
    () => ({
      requestFrameCapture() {
        wanted.setBlocking(1);
      },
      async capturePhoto() {
        const t = Date.now();
        const live = last.current?.info ?? null;
        const photo = await photoOutput.capturePhoto({ flashMode: 'off', enableShutterSound: false }, {});
        const t1 = Date.now();
        const image = await photo.toImageAsync();
        photo.dispose();
        return { image, live, frameT: t, convertMs: Date.now() - t1, source: 'photo' };
      },
    }),
    [wanted, photoOutput],
  );

  if (!permission.hasPermission) {
    return (
      <View style={[styles.box, styles.center]}>
        <Text style={styles.note}>Camera permission is needed. If no prompt appears, allow it in Android Settings → Apps.</Text>
      </View>
    );
  }
  return (
    <View style={styles.box}>
      <Camera
        style={StyleSheet.absoluteFill}
        device="front"
        isActive={active}
        outputs={[frameOutput, photoOutput]}
        onError={(e) => props.current.onError(`camera: ${e.message}`)}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  box: { width: '100%', aspectRatio: 3 / 4, backgroundColor: '#000', borderRadius: 12, overflow: 'hidden' },
  center: { alignItems: 'center', justifyContent: 'center', padding: 16 },
  note: { color: '#fff', textAlign: 'center' },
});
