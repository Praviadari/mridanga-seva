// Face scan (Phase 3, docs/DECISIONS.md #437): what the oval guide over the live camera shows (src/face/face-guide.tsx),
// worked out from the scan's phase and what the camera sees. Pure, so tests/face-scan.test.mjs checks it without a phone.

/** The scan's phase as src/face/face-scanner.tsx knows it. */
export type ScanPhase = 'challenge' | 'pictures' | 'failed' | 'working';

/** The guide's look: no face yet, a face to follow the prompts, pictures being taken, finished, or stopped. */
export type GuideTone = 'search' | 'found' | 'capture' | 'done' | 'failed';

/**
 * The tone for the oval's border.
 * @param faces how many faces the last camera frame showed.
 */
export function guideTone(phase: ScanPhase, faces: number): GuideTone {
  if (phase === 'failed') return 'failed';
  if (phase === 'working') return 'done';
  if (phase === 'pictures') return 'capture';
  return faces === 1 ? 'found' : 'search';
}

/** How much of the ring is filled: the pictures taken so far, 0 during the blink/turn challenge, full at the end. */
export function guideProgress(phase: ScanPhase, done: number, total: number): number {
  if (phase === 'working') return 1;
  if (phase !== 'pictures' || total <= 0) return 0;
  return Math.max(0, Math.min(1, done / total));
}

/** The scanning light moves only while the camera is working and the phone allows motion. */
export function guideSweeps(tone: GuideTone, reducedMotion: boolean): boolean {
  return !reducedMotion && (tone === 'search' || tone === 'found' || tone === 'capture');
}

/** The oval in a camera box of `width` x `height`: a face-shaped ellipse a little above the middle. */
export function guideOval(width: number, height: number) {
  const rx = width * 0.34;
  const ry = Math.min(height * 0.36, rx * 1.35);
  return { cx: width / 2, cy: height * 0.46, rx, ry };
}

/** An ellipse's circumference (Ramanujan's approximation), for the ring's dash length. */
export function ellipsePerimeter(rx: number, ry: number): number {
  const h = ((rx - ry) * (rx - ry)) / ((rx + ry) * (rx + ry));
  return Math.PI * (rx + ry) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
}
