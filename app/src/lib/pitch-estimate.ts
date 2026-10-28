// The pitch estimate behind the Voice games' approximate pitch line (docs/RHYTHM_PLAYGROUND.md §7.5, §11.2;
// docs/DECISIONS.md #764): the YIN method (de Cheveigné & Kawahara, 2002) on one short frame of microphone
// samples, on the device — nothing is sent anywhere. Research only: it says "higher / lower / close" with a
// confidence note, is stored as nothing but "practised", and must be compared with Prji's judgement on 10+ real
// voices before it may say more (§11.2, DYN-08). Pure arithmetic, checked by `npm test`; the microphone side is
// lib/pitch.web.ts.

/** Singing range searched (a low male voice to a child's high notes). */
export const PITCH_MIN_HZ = 70;
export const PITCH_MAX_HZ = 1000;

/** One frame's estimate: the pitch, and how clear it was (0-1; below ~0.75 it is not shown). */
export type PitchEstimate = { hz: number; clarity: number };

/** Root-mean-square level of a frame (0-1): below ~0.01 the room is too quiet to judge. */
export function frameLevel(frame: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
  return Math.sqrt(sum / Math.max(1, frame.length));
}

/**
 * YIN on one frame (2048 samples at 44.1/48 kHz is enough for 70 Hz). Returns null when nothing periodic is
 * found (silence, noise, a breath).
 */
export function estimatePitch(frame: ArrayLike<number>, rate: number, threshold = 0.15): PitchEstimate | null {
  const maxLag = Math.min(Math.floor(rate / PITCH_MIN_HZ), Math.floor(frame.length / 2));
  const minLag = Math.max(2, Math.floor(rate / PITCH_MAX_HZ));
  if (maxLag <= minLag + 2 || frameLevel(frame) < 0.01) return null;
  const n = frame.length - maxLag;
  const d = new Float64Array(maxLag + 1);
  for (let lag = 1; lag <= maxLag; lag++) {
    let s = 0;
    for (let i = 0; i < n; i++) {
      const x = frame[i] - frame[i + lag];
      s += x * x;
    }
    d[lag] = s;
  }
  // Cumulative mean normalised difference.
  const cm = new Float64Array(maxLag + 1);
  cm[0] = 1;
  let running = 0;
  for (let lag = 1; lag <= maxLag; lag++) {
    running += d[lag];
    cm[lag] = running > 0 ? (d[lag] * lag) / running : 1;
  }
  let lag = -1;
  for (let t = minLag; t <= maxLag; t++) {
    if (cm[t] < threshold) {
      while (t + 1 <= maxLag && cm[t + 1] < cm[t]) t++;
      lag = t;
      break;
    }
  }
  if (lag < 0) return null;
  // Parabolic interpolation for a lag between samples.
  const a = cm[lag - 1] ?? cm[lag];
  const b = cm[lag];
  const c = cm[lag + 1] ?? cm[lag];
  const den = a - 2 * b + c;
  const shift = den !== 0 ? (a - c) / (2 * den) : 0;
  const hz = rate / (lag + Math.max(-1, Math.min(1, shift)));
  return hz >= PITCH_MIN_HZ && hz <= PITCH_MAX_HZ ? { hz, clarity: Math.max(0, Math.min(1, 1 - b)) } : null;
}

/** The pitch line's three words (§7.5): never "good" or "bad", only where the voice is against the note. */
export type PitchWord = 'higher' | 'lower' | 'close';

/**
 * Compares a sung pitch with the note: within `closeCents` (default 50, a quarter tone each way) = close. An octave
 * away counts as the same note (a child singing a man's Sa an octave up is matching it).
 */
export function pitchWord(hz: number, targetHz: number, closeCents = 50): PitchWord {
  let cents = 1200 * Math.log2(hz / targetHz);
  cents -= 1200 * Math.round(cents / 1200);
  if (Math.abs(cents) <= closeCents) return 'close';
  return cents > 0 ? 'higher' : 'lower';
}

/** The median of the last estimates, so one wobbly frame does not flip the word. */
export function steadyPitch(recent: readonly PitchEstimate[], minClarity = 0.75): number | null {
  const ok = recent.filter((e) => e.clarity >= minClarity).map((e) => e.hz).sort((a, b) => a - b);
  if (ok.length < 3) return null;
  return ok[Math.floor(ok.length / 2)];
}
