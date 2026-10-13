// Face scan (Phase 3, from the P3-0 spike, docs/DECISIONS.md #307): from one camera picture (a
// react-native-nitro-image Image) to an SFace embedding and a MiniFASNet real-face score, with the time of every
// step (shown on the hidden developer screen). Native only: imported by src/face/face-scanner.tsx and the
// developer panel, whose .web.tsx stand-ins never import it.
//
// Landmarks: by default the picture is saved as a temporary JPEG in the app's cache, ML Kit runs again on that
// file ("exact"), and the file is deleted in the same call — so landmarks and pixels come from the same picture
// whatever way the camera turned or mirrored it. Once one exact run has matched the live-frame landmarks to the
// picture's, "fast" carries the live-frame landmarks over directly (no file, no second detection). No picture is
// ever kept (#308).

import { File } from 'expo-file-system';
import type { Image } from 'react-native-nitro-image';
import { loadTensorflowModel, type TfliteModel } from 'react-native-fast-tflite';
import { createImageFaceDetector, type Face, type ImageFaceDetector } from 'react-native-vision-camera-face-detector';

import {
  alignedFaceTensor,
  antiSpoofTensor,
  bestPlacement,
  l2normalize,
  placeBox,
  placeFivePoints,
  realFaceScore,
  templateOrder,
  type Box,
  type FivePoints,
  type PixelLayout,
  type Placement,
  type RawImage,
  type TensorLayout,
} from './face-math';

export type Models = {
  sface: TfliteModel;
  fasA: TfliteModel; // MiniFASNetV2, box x2.7
  fasB: TfliteModel; // MiniFASNetV1SE, box x4.0
  layout: { sface: TensorLayout; fas: TensorLayout };
  loadMs: number;
};

function layoutOf(model: TfliteModel, size: number): TensorLayout {
  const shape = model.inputs[0]?.shape ?? [];
  if (shape[1] === 3 && shape[2] === size) return 'nchw';
  return 'nhwc';
}

let modelsPromise: Promise<Models> | null = null;

/** Loads the three models once (CPU, no delegate). */
export function loadModels(): Promise<Models> {
  modelsPromise ??= (async () => {
    const t0 = Date.now();
    const [sface, fasA, fasB] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset
      loadTensorflowModel(require('@/assets/models/sface_2021dec_int8.tflite'), []),
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset
      loadTensorflowModel(require('@/assets/models/minifasnet_v2_2_7_int8.tflite'), []),
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset
      loadTensorflowModel(require('@/assets/models/minifasnet_v1se_4_0_int8.tflite'), []),
    ]);
    return { sface, fasA, fasB, layout: { sface: layoutOf(sface, 112), fas: layoutOf(fasA, 80) }, loadMs: Date.now() - t0 };
  })();
  modelsPromise.catch(() => {
    modelsPromise = null;
  });
  return modelsPromise;
}

/** Face values from ML Kit as plain numbers (a Face is a native object that must not outlive the call). */
export type FaceInfo = {
  box: Box;
  points: FivePoints | null;
  yaw: number;
  pitch: number;
  roll: number;
  leftEye?: number;
  rightEye?: number;
  frameWidth: number;
  frameHeight: number;
};

export function faceInfo(f: Face): FaceInfo {
  'worklet';
  const l = f.landmarks;
  const points =
    l && l.LEFT_EYE && l.RIGHT_EYE && l.NOSE_BASE && l.MOUTH_LEFT && l.MOUTH_RIGHT
      ? {
          leftEye: { x: l.LEFT_EYE.x, y: l.LEFT_EYE.y },
          rightEye: { x: l.RIGHT_EYE.x, y: l.RIGHT_EYE.y },
          nose: { x: l.NOSE_BASE.x, y: l.NOSE_BASE.y },
          mouthLeft: { x: l.MOUTH_LEFT.x, y: l.MOUTH_LEFT.y },
          mouthRight: { x: l.MOUTH_RIGHT.x, y: l.MOUTH_RIGHT.y },
        }
      : null;
  return {
    box: { x: f.bounds.x, y: f.bounds.y, width: f.bounds.width, height: f.bounds.height },
    points,
    yaw: f.yawAngle,
    pitch: f.pitchAngle,
    roll: f.rollAngle,
    leftEye: f.leftEyeOpenProbability,
    rightEye: f.rightEyeOpenProbability,
    frameWidth: f.frameWidth,
    frameHeight: f.frameHeight,
  };
}

let imageDetector: ImageFaceDetector | null = null;
function detector(): ImageFaceDetector {
  imageDetector ??= createImageFaceDetector({ performanceMode: 'accurate', runLandmarks: true, runClassifications: false, minFaceSize: 0.15 });
  return imageDetector;
}

/** Placement learnt from the last exact run (live-frame coordinates → picture coordinates). */
let learnt: { placement: Placement; error: number; turn: number } | null = null;
export function learntPlacement() {
  return learnt;
}

export type Timings = Record<string, number>;

export type Analysis = {
  embedding: Float32Array;
  realScore: number;
  fasA: number;
  fasB: number;
  path: 'exact' | 'fast';
  imageSize: string;
  timings: Timings;
};

/** Pixels of a picture, in the shape face-math wants. */
async function rawOf(image: Image): Promise<RawImage> {
  const raw = await image.toRawPixelDataAsync(false);
  const data = new Uint8Array(raw.buffer);
  const layout = (['RGBA', 'BGRA', 'RGBX', 'BGRX'] as const).includes(raw.pixelFormat as PixelLayout)
    ? (raw.pixelFormat as PixelLayout)
    : 'RGBA';
  return { data, width: raw.width, height: raw.height, stride: Math.round(data.byteLength / raw.height), layout };
}

/** ML Kit on the picture itself (via a temporary JPEG, deleted at once). Tries the picture turned if needed. */
async function detectOnImage(image: Image, timings: Timings): Promise<{ image: Image; face: FaceInfo; turn: number }> {
  const turns = learnt ? [learnt.turn, 0, 90, 270, 180].filter((v, i, a) => a.indexOf(v) === i) : [0, 90, 270, 180];
  for (const turn of turns) {
    const pic = turn === 0 ? image : await image.rotateAsync(turn, false);
    const t0 = Date.now();
    const path = await pic.saveToTemporaryFileAsync('jpg', 95);
    timings.saveJpg = (timings.saveJpg ?? 0) + Date.now() - t0;
    const t1 = Date.now();
    let faces: Face[] = [];
    try {
      faces = detector().detectFaces(`file://${path}`);
    } finally {
      try {
        new File(`file://${path}`).delete();
      } catch {
        // already gone
      }
    }
    timings.detectStill = (timings.detectStill ?? 0) + Date.now() - t1;
    if (faces.length >= 1) {
      // Largest face = the person in front of the phone.
      const f = faces.reduce((a, b) => (b.bounds.width > a.bounds.width ? b : a));
      return { image: pic, face: faceInfo(f), turn };
    }
  }
  throw new Error('No face found in the captured picture');
}

/**
 * Embedding + real-face score for one picture. `live` = ML Kit's values on the live frame the picture came
 * from (for the fast path and for learning the placement); `fast` = use them instead of a second detection.
 */
export async function analyse(image: Image, live: FaceInfo | null, fast: boolean): Promise<Analysis> {
  const timings: Timings = {};
  const models = await loadModels();
  let pic = image;
  let face: FaceInfo;
  let path: Analysis['path'] = 'exact';
  if (fast && learnt && live?.points) {
    path = 'fast';
    const t0 = Date.now();
    if (learnt.turn !== 0) pic = await image.rotateAsync(learnt.turn, false);
    const fw = live.frameWidth, fh = live.frameHeight;
    face = {
      ...live,
      points: placeFivePoints(live.points, fw, fh, pic.width, learnt.placement),
      box: placeBox(live.box, fw, fh, pic.width, learnt.placement),
    };
    timings.place = Date.now() - t0;
  } else {
    const found = await detectOnImage(image, timings);
    pic = found.image;
    face = found.face;
    if (live?.points && face.points) {
      try {
        const best = bestPlacement(templateOrder(live.points), templateOrder(face.points), live.frameWidth, live.frameHeight, pic.width, pic.height);
        learnt = { ...best, turn: found.turn };
      } catch {
        // aspect ratios differ (photo path): keep the old placement
      }
    }
  }
  if (!face.points) throw new Error('ML Kit gave no eye/nose/mouth points');

  let t = Date.now();
  const raw = await rawOf(pic);
  timings.pixels = Date.now() - t;

  t = Date.now();
  const sIn = alignedFaceTensor(raw, face.points, models.layout.sface);
  const aIn = antiSpoofTensor(raw, face.box, 2.7, models.layout.fas);
  const bIn = antiSpoofTensor(raw, face.box, 4.0, models.layout.fas);
  timings.crops = Date.now() - t;

  t = Date.now();
  const [sOut] = await models.sface.run([sIn.buffer as ArrayBuffer]);
  timings.sface = Date.now() - t;

  t = Date.now();
  const [aOut] = await models.fasA.run([aIn.buffer as ArrayBuffer]);
  const [bOut] = await models.fasB.run([bIn.buffer as ArrayBuffer]);
  timings.fas = Date.now() - t;

  const pa = new Float32Array(aOut);
  const pb = new Float32Array(bOut);
  return {
    embedding: l2normalize(new Float32Array(sOut)),
    realScore: realFaceScore(pa, pb),
    fasA: pa[1],
    fasB: pb[1],
    path,
    imageSize: `${raw.width}x${raw.height}`,
    timings,
  };
}
