// Face spike (Phase 3 P3-0, branch p3-spike, never merged): the arithmetic between the camera and the
// models, kept free of React Native so tests/spike-face-math.test.mjs can check it in plain Node and
// docs/phase3/SPIKE_RESULT.md can compare it with OpenCV's own SFace pipeline.
//
// Pixels come in as raw RGBA/BGRA bytes (react-native-nitro-image's toRawPixelData). Two crops are made:
// - SFace (OpenCV Zoo, Apache 2.0): the face aligned on 5 landmarks to the 112x112 ArcFace template,
//   RGB, 0..255 (the model subtracts 127.5 and scales itself), as OpenCV's FaceRecognizerSF does.
// - MiniFASNet (minivision Silent-Face-Anti-Spoofing, Apache 2.0): the face box widened by 2.7 and by 4.0,
//   resized to 80x80, BGR, 0..255, as the upstream CropImage + ToTensor do. Output index 1 = real face.

export type Pt = { x: number; y: number };

/** The five points SFace aligns on, in image pixels. "Left"/"right" are ML Kit's (the person's own). */
export type FivePoints = { leftEye: Pt; rightEye: Pt; nose: Pt; mouthLeft: Pt; mouthRight: Pt };

/** Similarity transform x' = a*x - b*y + tx, y' = b*x + a*y + ty (rotation, uniform scale, shift). */
export type Similarity = { a: number; b: number; tx: number; ty: number };

/** Axis-aligned box in pixels: left, top, width, height (ML Kit's Bounds). */
export type Box = { x: number; y: number; width: number; height: number };

export type PixelLayout = 'RGBA' | 'BGRA' | 'RGBX' | 'BGRX';
export type ChannelOrder = 'rgb' | 'bgr';
export type TensorLayout = 'nhwc' | 'nchw';

/** A raw 8-bit, 4-channel image. `stride` is bytes per row (4 * width when packed). */
export type RawImage = { data: Uint8Array; width: number; height: number; stride: number; layout: PixelLayout };

/** The ArcFace / OpenCV FaceRecognizerSF target points for a 112x112 crop, in image order (left to right). */
export const SFACE_TEMPLATE: readonly Pt[] = [
  { x: 38.2946, y: 51.6963 },
  { x: 73.5318, y: 51.5014 },
  { x: 56.0252, y: 71.7366 },
  { x: 41.5493, y: 92.3655 },
  { x: 70.7299, y: 92.2041 },
];

/**
 * The five points in the template's order: the eye seen further left in the image first, then the other eye,
 * the nose, and the two mouth corners left to right. Sorting by x (not by ML Kit's left/right names) keeps
 * enrolment and check-in consistent even when one camera path mirrors the picture and another does not.
 */
export function templateOrder(p: FivePoints): Pt[] {
  const [e1, e2] = p.leftEye.x <= p.rightEye.x ? [p.leftEye, p.rightEye] : [p.rightEye, p.leftEye];
  const [m1, m2] = p.mouthLeft.x <= p.mouthRight.x ? [p.mouthLeft, p.mouthRight] : [p.mouthRight, p.mouthLeft];
  return [e1, e2, p.nose, m1, m2];
}

/** Least-squares similarity transform taking `src` points onto `dst` points (same count, at least 2). */
export function similarityTransform(src: readonly Pt[], dst: readonly Pt[]): Similarity {
  const n = src.length;
  let sx = 0, sy = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    sx += src[i].x; sy += src[i].y; dx += dst[i].x; dy += dst[i].y;
  }
  sx /= n; sy /= n; dx /= n; dy /= n;
  let num1 = 0, num2 = 0, den = 0;
  for (let i = 0; i < n; i++) {
    const px = src[i].x - sx, py = src[i].y - sy;
    const qx = dst[i].x - dx, qy = dst[i].y - dy;
    num1 += px * qx + py * qy;
    num2 += px * qy - py * qx;
    den += px * px + py * py;
  }
  if (den === 0) throw new Error('similarityTransform: all source points are the same');
  const a = num1 / den;
  const b = num2 / den;
  return { a, b, tx: dx - (a * sx - b * sy), ty: dy - (b * sx + a * sy) };
}

export function applySimilarity(t: Similarity, p: Pt): Pt {
  return { x: t.a * p.x - t.b * p.y + t.tx, y: t.b * p.x + t.a * p.y + t.ty };
}

export function invertSimilarity(t: Similarity): Similarity {
  const s2 = t.a * t.a + t.b * t.b;
  const a = t.a / s2;
  const b = -t.b / s2;
  // inverse(p) = R^-1 (p - t)
  return { a, b, tx: -(a * t.tx - b * t.ty), ty: -(b * t.tx + a * t.ty) };
}

function channelOffsets(layout: PixelLayout): [number, number, number] {
  // Byte offsets of R, G, B inside one 4-byte pixel.
  return layout === 'BGRA' || layout === 'BGRX' ? [2, 1, 0] : [0, 1, 2];
}

/**
 * Fills `out` (outW x outH x 3 floats, 0..255) by sampling `img` bilinearly at srcOf(u, v) for every output
 * pixel centre. Outside the image the edge pixel repeats (OpenCV's BORDER_REPLICATE would differ only there).
 */
function sampleInto(
  img: RawImage,
  outW: number,
  outH: number,
  order: ChannelOrder,
  layout: TensorLayout,
  srcOf: (u: number, v: number) => Pt,
  out: Float32Array,
): Float32Array {
  const [ro, go, bo] = channelOffsets(img.layout);
  const c0 = order === 'rgb' ? ro : bo;
  const c2 = order === 'rgb' ? bo : ro;
  const { data, width: w, height: h, stride } = img;
  const plane = outW * outH;
  for (let v = 0; v < outH; v++) {
    for (let u = 0; u < outW; u++) {
      const s = srcOf(u, v);
      let x = s.x, y = s.y;
      if (x < 0) x = 0; else if (x > w - 1) x = w - 1;
      if (y < 0) y = 0; else if (y > h - 1) y = h - 1;
      const x0 = Math.floor(x), y0 = Math.floor(y);
      const x1 = x0 + 1 < w ? x0 + 1 : x0, y1 = y0 + 1 < h ? y0 + 1 : y0;
      const fx = x - x0, fy = y - y0;
      const i00 = y0 * stride + x0 * 4, i01 = y0 * stride + x1 * 4;
      const i10 = y1 * stride + x0 * 4, i11 = y1 * stride + x1 * 4;
      const w00 = (1 - fx) * (1 - fy), w01 = fx * (1 - fy), w10 = (1 - fx) * fy, w11 = fx * fy;
      const ch = [c0, go, c2];
      for (let c = 0; c < 3; c++) {
        const o = ch[c];
        const val = data[i00 + o] * w00 + data[i01 + o] * w01 + data[i10 + o] * w10 + data[i11 + o] * w11;
        const k = v * outW + u;
        if (layout === 'nhwc') out[k * 3 + c] = val; else out[c * plane + k] = val;
      }
    }
  }
  return out;
}

/** The SFace input: the face warped onto SFACE_TEMPLATE, 112x112, RGB 0..255, in the model's layout. */
export function alignedFaceTensor(img: RawImage, points: FivePoints, layout: TensorLayout): Float32Array {
  const toCrop = similarityTransform(templateOrder(points), SFACE_TEMPLATE);
  const toImage = invertSimilarity(toCrop);
  return sampleInto(img, 112, 112, 'rgb', layout, (u, v) => applySimilarity(toImage, { x: u, y: v }), new Float32Array(112 * 112 * 3));
}

/**
 * The upstream Silent-Face-Anti-Spoofing CropImage._get_new_box: the box widened `scale` times around its centre,
 * shrunk if it would not fit, then shifted back inside the image. Returns inclusive pixel corners.
 */
export function antiSpoofBox(srcW: number, srcH: number, box: Box, scale: number) {
  const s = Math.min((srcH - 1) / box.height, Math.min((srcW - 1) / box.width, scale));
  const newW = box.width * s;
  const newH = box.height * s;
  const cx = box.width / 2 + box.x;
  const cy = box.height / 2 + box.y;
  let left = cx - newW / 2, top = cy - newH / 2, right = cx + newW / 2, bottom = cy + newH / 2;
  if (left < 0) { right -= left; left = 0; }
  if (top < 0) { bottom -= top; top = 0; }
  if (right > srcW - 1) { left -= right - srcW + 1; right = srcW - 1; }
  if (bottom > srcH - 1) { top -= bottom - srcH + 1; bottom = srcH - 1; }
  return { left: Math.trunc(left), top: Math.trunc(top), right: Math.trunc(right), bottom: Math.trunc(bottom) };
}

/** A MiniFASNet input: antiSpoofBox(scale) resized to 80x80 like cv2.resize (bilinear), BGR 0..255. */
export function antiSpoofTensor(img: RawImage, box: Box, scale: number, layout: TensorLayout): Float32Array {
  const r = antiSpoofBox(img.width, img.height, box, scale);
  const cw = r.right - r.left + 1;
  const chh = r.bottom - r.top + 1;
  const sx = cw / 80, sy = chh / 80;
  return sampleInto(
    img, 80, 80, 'bgr', layout,
    (u, v) => ({ x: r.left + (u + 0.5) * sx - 0.5, y: r.top + (v + 0.5) * sy - 0.5 }),
    new Float32Array(80 * 80 * 3),
  );
}

/** Copy of `v` scaled to length 1. */
export function l2normalize(v: ArrayLike<number>): Float32Array {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  const n = Math.sqrt(s) || 1;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / n;
  return out;
}

/** Cosine similarity, -1..1 (OpenCV FaceRecognizerSF FR_COSINE; its suggested same-person threshold is 0.363). */
export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let ab = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) {
    ab += a[i] * b[i]; aa += a[i] * a[i]; bb += b[i] * b[i];
  }
  return ab / (Math.sqrt(aa * bb) || 1);
}

/** The enrolment template: the normalised mean of normalised embeddings. */
export function meanTemplate(embeddings: readonly ArrayLike<number>[]): Float32Array {
  if (embeddings.length === 0) throw new Error('meanTemplate: no embeddings');
  const sum = new Float32Array(embeddings[0].length);
  for (const e of embeddings) {
    const n = l2normalize(e);
    for (let i = 0; i < n.length; i++) sum[i] += n[i];
  }
  return l2normalize(sum);
}

/** Float32Array <-> base64, for keeping templates as text (expo-secure-store holds strings). */
export function floatsToBase64(v: Float32Array): string {
  const bytes = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

export function base64ToFloats(b64: string): Float32Array {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return new Float32Array(bytes.buffer);
}

/** MiniFASNet ensemble as upstream test.py: the two softmax outputs summed; real-face score = sum[1] / 2. */
export function realFaceScore(probsA: ArrayLike<number>, probsB: ArrayLike<number>): number {
  return (probsA[1] + probsB[1]) / 2;
}

// ---- Mapping ML Kit's frame coordinates onto the converted picture -------------------------------------

/** One of the 8 ways a picture can sit relative to another: turned 0/90/180/270 degrees, then maybe mirrored. */
export type Placement = { turn: 0 | 90 | 180 | 270; mirror: boolean };

export const PLACEMENTS: readonly Placement[] = [0, 90, 180, 270].flatMap((turn) => [
  { turn: turn as Placement['turn'], mirror: false },
  { turn: turn as Placement['turn'], mirror: true },
]);

/**
 * Where a point of a fw x fh picture lands after turning it clockwise by `turn` and mirroring, scaled so
 * the turned picture is iw wide. Used to carry ML Kit's live-frame landmarks onto the converted image.
 */
export function placePoint(p: Pt, fw: number, fh: number, iw: number, pl: Placement): Pt {
  let x: number, y: number, w: number;
  switch (pl.turn) {
    case 90: x = fh - p.y; y = p.x; w = fh; break;
    case 180: x = fw - p.x; y = fh - p.y; w = fw; break;
    case 270: x = p.y; y = fw - p.x; w = fh; break;
    default: x = p.x; y = p.y; w = fw;
  }
  if (pl.mirror) x = w - x;
  const s = iw / w;
  return { x: x * s, y: y * s };
}

/** Turned picture size for a placement. */
export function placedSize(fw: number, fh: number, pl: Placement): { w: number; h: number } {
  return pl.turn === 90 || pl.turn === 270 ? { w: fh, h: fw } : { w: fw, h: fh };
}

/**
 * The placement that best carries `framePts` (in a fw x fh frame) onto `imagePts` (the same landmarks found
 * again in the iw x ih image), with its mean distance in image pixels. Only placements whose turned size has
 * the image's aspect ratio are tried.
 */
export function bestPlacement(
  framePts: readonly Pt[],
  imagePts: readonly Pt[],
  fw: number, fh: number, iw: number, ih: number,
): { placement: Placement; error: number } {
  let best: { placement: Placement; error: number } | null = null;
  for (const pl of PLACEMENTS) {
    const size = placedSize(fw, fh, pl);
    if (Math.abs(size.w / size.h - iw / ih) > 0.02) continue;
    let err = 0;
    for (let i = 0; i < framePts.length; i++) {
      const q = placePoint(framePts[i], fw, fh, iw, pl);
      err += Math.hypot(q.x - imagePts[i].x, q.y - imagePts[i].y);
    }
    err /= framePts.length;
    if (!best || err < best.error) best = { placement: pl, error: err };
  }
  if (!best) throw new Error('bestPlacement: no placement has the image aspect ratio');
  return best;
}

export function placeFivePoints(p: FivePoints, fw: number, fh: number, iw: number, pl: Placement): FivePoints {
  return {
    leftEye: placePoint(p.leftEye, fw, fh, iw, pl),
    rightEye: placePoint(p.rightEye, fw, fh, iw, pl),
    nose: placePoint(p.nose, fw, fh, iw, pl),
    mouthLeft: placePoint(p.mouthLeft, fw, fh, iw, pl),
    mouthRight: placePoint(p.mouthRight, fw, fh, iw, pl),
  };
}

export function placeBox(b: Box, fw: number, fh: number, iw: number, pl: Placement): Box {
  const a = placePoint({ x: b.x, y: b.y }, fw, fh, iw, pl);
  const c = placePoint({ x: b.x + b.width, y: b.y + b.height }, fw, fh, iw, pl);
  return { x: Math.min(a.x, c.x), y: Math.min(a.y, c.y), width: Math.abs(c.x - a.x), height: Math.abs(c.y - a.y) };
}

// ---- Error rates -------------------------------------------------------------------------------------

/** False accept rate (impostor scores at or above t) and false reject rate (genuine scores below t). */
export function ratesAt(t: number, genuine: readonly number[], impostor: readonly number[]) {
  const fa = impostor.filter((s) => s >= t).length;
  const fr = genuine.filter((s) => s < t).length;
  return { far: impostor.length ? fa / impostor.length : NaN, frr: genuine.length ? fr / genuine.length : NaN, fa, fr };
}

/** The lowest threshold with no false accept among `impostor`, and the false reject rate there. */
export function zeroFalseAcceptPoint(genuine: readonly number[], impostor: readonly number[]) {
  const t = impostor.length ? Math.max(...impostor) + 1e-6 : -1;
  return { threshold: t, ...ratesAt(t, genuine, impostor) };
}
