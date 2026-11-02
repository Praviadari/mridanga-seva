// Face scan (Phase 3, docs/DECISIONS.md #307): the arithmetic between camera and models (src/face/face-math.ts)
// and the blink/turn challenge (src/face/liveness.ts), both from the P3-0 spike with its tests. The model parity
// with OpenCV was checked in the spike (docs/phase3/SPIKE_RESULT.md §4, branch p3-spike).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import './stubs/register.mjs';

const m = await import('../src/face/face-math.ts');
const L = await import('../src/face/liveness.ts');
const G = await import('../src/face/face-guide-state.ts');

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);

test('similarity transform recovers a known rotation + scale + shift, and inverts', () => {
  const t = { a: 0.8 * Math.cos(0.3), b: 0.8 * Math.sin(0.3), tx: 12, ty: -5 };
  const src = [{ x: 10, y: 20 }, { x: 50, y: 22 }, { x: 30, y: 40 }, { x: 15, y: 60 }, { x: 45, y: 61 }];
  const dst = src.map((p) => m.applySimilarity(t, p));
  const got = m.similarityTransform(src, dst);
  for (const k of ['a', 'b', 'tx', 'ty']) near(got[k], t[k], 1e-9);
  const back = m.invertSimilarity(got);
  for (const p of src) {
    const q = m.applySimilarity(back, m.applySimilarity(got, p));
    near(q.x, p.x, 1e-9);
    near(q.y, p.y, 1e-9);
  }
});

test('template order sorts eyes and mouth corners by x, whatever ML Kit calls them', () => {
  const pts = { leftEye: { x: 70, y: 50 }, rightEye: { x: 40, y: 50 }, nose: { x: 55, y: 70 }, mouthLeft: { x: 68, y: 90 }, mouthRight: { x: 42, y: 90 } };
  const o = m.templateOrder(pts);
  assert.deepEqual(o.map((p) => p.x), [40, 70, 55, 42, 68]);
});

test('aligned crop of a face already on the template copies pixels (identity warp)', () => {
  const w = 112, h = 112;
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = i % 251; data[i * 4 + 1] = (i * 7) % 253; data[i * 4 + 2] = (i * 13) % 255; data[i * 4 + 3] = 255;
  }
  const T = m.SFACE_TEMPLATE;
  const points = { rightEye: T[0], leftEye: T[1], nose: T[2], mouthRight: T[3], mouthLeft: T[4] };
  const nhwc = m.alignedFaceTensor({ data, width: w, height: h, stride: w * 4, layout: 'RGBA' }, points, 'nhwc');
  const nchw = m.alignedFaceTensor({ data, width: w, height: h, stride: w * 4, layout: 'RGBA' }, points, 'nchw');
  for (const k of [0, 777, 5000, 12543]) {
    near(nhwc[k * 3], data[k * 4], 1e-3);
    near(nhwc[k * 3 + 2], data[k * 4 + 2], 1e-3);
    near(nchw[k], data[k * 4], 1e-3);
    near(nchw[2 * w * h + k], data[k * 4 + 2], 1e-3);
  }
  // BGRA input gives the same RGB tensor.
  const bgra = new Uint8Array(data);
  for (let i = 0; i < w * h; i++) [bgra[i * 4], bgra[i * 4 + 2]] = [data[i * 4 + 2], data[i * 4]];
  const fromBgra = m.alignedFaceTensor({ data: bgra, width: w, height: h, stride: w * 4, layout: 'BGRA' }, points, 'nhwc');
  near(fromBgra[777 * 3], nhwc[777 * 3], 1e-3);
});

test('anti-spoof box matches the upstream CropImage rules (widen, shrink to fit, shift inside)', () => {
  // centred, fits: 100x120 box x2.7 in a 1000x1000 picture
  assert.deepEqual(m.antiSpoofBox(1000, 1000, { x: 450, y: 440, width: 100, height: 120 }, 2.7), { left: 365, top: 338, right: 635, bottom: 662 });
  // too big: scale shrinks to (srcH-1)/h
  const big = m.antiSpoofBox(640, 480, { x: 200, y: 100, width: 200, height: 240 }, 4.0);
  assert.equal(big.bottom - big.top, 479);
  assert.ok(big.left >= 0 && big.right <= 639 && big.top >= 0);
  // near the left edge: shifted right, same width
  const edge = m.antiSpoofBox(640, 480, { x: 5, y: 200, width: 60, height: 60 }, 2.7);
  assert.equal(edge.left, 0);
  assert.equal(edge.right, 162);
});

test('anti-spoof tensor is BGR and 80x80', () => {
  const w = 200, h = 200;
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) { data[i * 4] = 10; data[i * 4 + 1] = 20; data[i * 4 + 2] = 30; data[i * 4 + 3] = 255; }
  const t = m.antiSpoofTensor({ data, width: w, height: h, stride: w * 4, layout: 'RGBA' }, { x: 80, y: 80, width: 40, height: 40 }, 2.7, 'nhwc');
  assert.equal(t.length, 80 * 80 * 3);
  assert.deepEqual([t[0], t[1], t[2]], [30, 20, 10]);
});

test('cosine, mean template and base64 round trip', () => {
  near(m.cosine([1, 0], [0, 1]), 0);
  near(m.cosine([1, 2, 3], [2, 4, 6]), 1);
  const tpl = m.meanTemplate([[1, 0, 0], [0, 1, 0]]);
  near(tpl[0], Math.SQRT1_2); near(tpl[1], Math.SQRT1_2);
  const v = new Float32Array([0.5, -1.25, 3.75, 1e-7]);
  assert.deepEqual(Array.from(m.base64ToFloats(m.floatsToBase64(v))), Array.from(v));
});

test('placement: each of the 8 turns/mirrors is found again from landmarks', () => {
  const fw = 480, fh = 640;
  const pts = [{ x: 200, y: 260 }, { x: 290, y: 255 }, { x: 245, y: 320 }, { x: 210, y: 380 }, { x: 285, y: 378 }];
  for (const pl of m.PLACEMENTS) {
    const size = m.placedSize(fw, fh, pl);
    const iw = size.w * 1.5, ih = size.h * 1.5; // the picture can be bigger than ML Kit's frame
    const imagePts = pts.map((p) => m.placePoint(p, fw, fh, iw, pl));
    const best = m.bestPlacement(pts, imagePts, fw, fh, iw, ih);
    assert.deepEqual(best.placement, pl);
    near(best.error, 0, 1e-9);
  }
});

test('error rates and the no-false-accept point', () => {
  const genuine = [0.7, 0.6, 0.55, 0.4, 0.3];
  const impostor = [0.1, 0.2, 0.35, 0.05];
  assert.deepEqual(m.ratesAt(0.36, genuine, impostor), { far: 0, frr: 0.2, fa: 0, fr: 1 });
  assert.deepEqual(m.ratesAt(0.3, genuine, impostor), { far: 0.25, frr: 0, fa: 1, fr: 0 });
  const z = m.zeroFalseAcceptPoint(genuine, impostor);
  near(z.threshold, 0.35 + 1e-6);
  assert.equal(z.fa, 0);
});

const frame = (t, o = {}) => ({ t, faces: 1, yaw: 0, pitch: 0, leftEye: 0.9, rightEye: 0.9, widthShare: 0.4, ...o });

test('challenge: blink then turn passes', () => {
  const c = { ...L.DEFAULT_CHALLENGE, steps: ['blink', 'turn'] };
  let s = L.initialChallenge();
  s = L.stepChallenge(s, frame(0), c);
  assert.equal(s.kind, 'waitFace');
  s = L.stepChallenge(s, frame(600), c);
  assert.equal(s.kind, 'step');
  s = L.stepChallenge(s, frame(700, { leftEye: 0.1, rightEye: 0.05 }), c);
  s = L.stepChallenge(s, frame(800), c);
  assert.equal(s.kind, 'step');
  assert.equal(s.index, 1);
  s = L.stepChallenge(s, frame(1200, { yaw: -30 }), c);
  s = L.stepChallenge(s, frame(1600, { yaw: 3 }), c);
  assert.equal(s.kind, 'passed');
  assert.equal(s.ms, 1000);
});

test('challenge: a photo (no blink) times out; two faces or a lost face fail', () => {
  const c = { ...L.DEFAULT_CHALLENGE, steps: ['blink', 'turn'] };
  let s = L.stepChallenge(L.stepChallenge(L.initialChallenge(), frame(0), c), frame(600), c);
  for (let t = 700; t < 9000; t += 100) s = L.stepChallenge(s, frame(t), c);
  assert.deepEqual([s.kind, s.reason], ['failed', 'timeout']);
  let s2 = L.stepChallenge(L.stepChallenge(L.initialChallenge(), frame(0), c), frame(600), c);
  s2 = L.stepChallenge(s2, frame(700, { faces: 2 }), c);
  assert.deepEqual([s2.kind, s2.reason], ['failed', 'manyFaces']);
  let s3 = L.stepChallenge(L.stepChallenge(L.initialChallenge(), frame(0), c), frame(600), c);
  s3 = L.stepChallenge(s3, frame(700, { faces: 0 }), c);
  assert.equal(s3.kind, 'step');
  s3 = L.stepChallenge(s3, frame(1500, { faces: 0 }), c);
  assert.deepEqual([s3.kind, s3.reason], ['failed', 'faceLost']);
});

test('challenge waits for a close, frontal, single face; capture needs open eyes', () => {
  const c = L.DEFAULT_CHALLENGE;
  assert.equal(L.stepChallenge(L.initialChallenge(), frame(0, { widthShare: 0.1 }), c).hint, 'closer');
  assert.equal(L.stepChallenge(L.initialChallenge(), frame(0, { yaw: 30 }), c).hint, 'lookStraight');
  assert.equal(L.stepChallenge(L.initialChallenge(), frame(0, { faces: 3 }), c).hint, 'manyFaces');
  assert.equal(L.goodForCapture(frame(0)), true);
  assert.equal(L.goodForCapture(frame(0, { leftEye: 0.2 })), false);
  assert.deepEqual(L.randomSteps(() => 0.1), ['blink', 'turn']);
  assert.deepEqual(L.randomSteps(() => 0.9), ['turn', 'blink']);
});

test('every challenge state has a prompt in English, Telugu and Hindi', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const dir = path.resolve(import.meta.dirname, '../src/i18n/locales');
  const steps = ['blink', 'turn'];
  const states = [
    ...['noFace', 'manyFaces', 'closer', 'lookStraight', 'hold'].map((hint) => ({ kind: 'waitFace', hint })),
    ...[0, 1].flatMap((index) => ['away', 'back'].map((phase) => ({ kind: 'step', index, phase }))),
    { kind: 'passed', ms: 1, at: 1 },
    ...['timeout', 'faceLost', 'manyFaces'].map((reason) => ({ kind: 'failed', reason, at: 1 })),
  ];
  const keys = new Set(states.map((s) => L.challengeKey(s, steps)));
  assert.equal(keys.size, 13);
  for (const lang of ['en', 'te', 'hi']) {
    const json = JSON.parse(fs.readFileSync(path.join(dir, `${lang}.json`), 'utf8'));
    for (const key of keys) {
      const text = key.split('.').reduce((o, k) => o?.[k], json);
      assert.equal(typeof text, 'string', `${lang} ${key}`);
    }
  }
});
test("#437 the camera guide: white until a face, gold with one face, green for the pictures, red when stopped", () => {
  assert.equal(G.guideTone("challenge", 0), "search");
  assert.equal(G.guideTone("challenge", 2), "search");
  assert.equal(G.guideTone("challenge", 1), "found");
  assert.equal(G.guideTone("pictures", 1), "capture");
  assert.equal(G.guideTone("working", 0), "done");
  assert.equal(G.guideTone("failed", 1), "failed");
});

test("#437 the ring fills with the pictures and the light sweeps only while scanning and motion is allowed", () => {
  assert.equal(G.guideProgress("challenge", 0, 5), 0);
  assert.equal(G.guideProgress("pictures", 2, 5), 0.4);
  assert.equal(G.guideProgress("pictures", 9, 5), 1);
  assert.equal(G.guideProgress("working", 0, 5), 1);
  assert.equal(G.guideSweeps("found", false), true);
  assert.equal(G.guideSweeps("found", true), false);
  assert.equal(G.guideSweeps("done", false), false);
  assert.equal(G.guideSweeps("failed", false), false);
  // A circle: 2 pi r; the oval sits inside its box.
  near(G.ellipsePerimeter(10, 10), 2 * Math.PI * 10, 1e-9);
  const o = G.guideOval(300, 400);
  assert.ok(o.cx - o.rx >= 0 && o.cx + o.rx <= 300 && o.cy - o.ry >= 0 && o.cy + o.ry <= 400, JSON.stringify(o));
});
