// Recorded drum strokes made ready to play (docs/DECISIONS.md #473; lib/khol-samples.ts loads them): a WAV file read
// into samples, cut to start at the stroke and made as loud as the others, and changed to the rate a sound engine
// uses. Plain arithmetic, so the tests run it without a phone.

/** A WAV file read into samples: its rate and one channel (-1..1), stereo mixed down. null = not a WAV this reads. */
export function parseWav(bytes: Uint8Array): { rate: number; samples: Float32Array } | null {
  if (bytes.length < 44) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (at: number) => String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);
  if (text(0) !== 'RIFF' || text(8) !== 'WAVE') return null;
  let format = 0;
  let channels = 0;
  let rate = 0;
  let bits = 0;
  let at = 12;
  while (at + 8 <= bytes.length) {
    const id = text(at);
    const size = view.getUint32(at + 4, true);
    const body = at + 8;
    if (id === 'fmt ') {
      format = view.getUint16(body, true);
      channels = view.getUint16(body + 2, true);
      rate = view.getUint32(body + 4, true);
      bits = view.getUint16(body + 14, true);
    } else if (id === 'data') {
      // 1 = PCM (16 or 24 bit), 3 = 32-bit float; 0xFFFE (extensible) is read as its bit depth says.
      const float = format === 3 || (format === 0xfffe && bits === 32);
      if (!channels || !rate || !(bits === 16 || bits === 24 || (bits === 32 && float))) return null;
      const width = bits / 8;
      const frames = Math.floor(Math.min(size, bytes.length - body) / (width * channels));
      const samples = new Float32Array(frames);
      for (let f = 0; f < frames; f++) {
        let sum = 0;
        for (let c = 0; c < channels; c++) {
          const p = body + (f * channels + c) * width;
          if (float) sum += view.getFloat32(p, true);
          else if (bits === 16) sum += view.getInt16(p, true) / 32768;
          else sum += (((bytes[p + 2] << 24) | (bytes[p + 1] << 16) | (bytes[p] << 8)) >> 8) / 8388608;
        }
        samples[f] = sum / channels;
      }
      return { rate, samples };
    }
    at = body + size + (size % 2);
  }
  return null;
}

/** Longest recorded stroke kept, seconds: the ring of an open gha dies away well before. */
export const MAX_STROKE_SECONDS = 1.5;

/**
 * A recording made ready to play as a stroke: starts at the stroke (the quiet before it cut off, so it lands on the
 * beat), at most 1.5 s with a short fade at the end, its loudest point at 0.9 (all strokes equally loud).
 */
export function prepareStroke(samples: Float32Array, rate: number): Float32Array {
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  if (peak === 0) return new Float32Array(0);
  const threshold = peak * 0.05;
  let start = samples.findIndex((s) => Math.abs(s) >= threshold);
  start = Math.max(0, start - Math.round(rate * 0.002));
  const length = Math.min(samples.length - start, Math.round(rate * MAX_STROKE_SECONDS));
  const out = new Float32Array(length);
  const gain = 0.9 / peak;
  const fade = Math.min(length, Math.round(rate * 0.03));
  for (let i = 0; i < length; i++) {
    const tail = i >= length - fade ? (length - i) / fade : 1;
    out[i] = samples[start + i] * gain * tail;
  }
  return out;
}

/** Samples at another rate (straight lines between the samples: enough for drum strokes). */
export function resample(samples: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return samples;
  const length = Math.max(1, Math.round((samples.length * to) / from));
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const x = (i * from) / to;
    const k = Math.floor(x);
    const a = samples[Math.min(k, samples.length - 1)];
    const b = samples[Math.min(k + 1, samples.length - 1)];
    out[i] = a + (b - a) * (x - k);
  }
  return out;
}
