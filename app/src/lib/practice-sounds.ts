// The practice tools' sounds, made by arithmetic instead of recordings, so they cost no download,
// work offline and are the same on every phone and browser. A rough likeness of the khol: the
// dayan rings high (open tā, nā) or is damped (tī, ra, te); the baya booms low with a falling pitch
// (gha, ga), rises (gin) or thuds (ka). Real recorded strokes can replace them later (team input).
//
// renderSound gives one sound as samples (-1..1). renderLoop mixes one whole cycle at a tempo, the
// tails of the last strokes wrapped round to the start so the loop has no seam; the phone engine
// plays it as a looping WAV file (wavFile), the browser engine plays each sound on the audio clock.

import type { SoundId } from './bols';
import type { Layer, Pattern, PatternEvent } from './practice-pattern';

/** A small fixed-seed random generator, so the noise in a sound is the same every time. */
function noise(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2147483648 - 1;
  };
}

type Tone = { freq: number; gain: number; decay: number; bendTo?: number; bendTime?: number };

/** A struck membrane: decaying sine partials (optionally bending in pitch) plus a short noise attack. */
function membrane(rate: number, seconds: number, partials: Tone[], click: { gain: number; decay: number }, seed: number): Float32Array {
  const length = Math.ceil(rate * seconds);
  const out = new Float32Array(length);
  const rand = noise(seed);
  let low = 0;
  for (const p of partials) {
    let phase = 0;
    for (let i = 0; i < length; i++) {
      const t = i / rate;
      let freq = p.freq;
      if (p.bendTo !== undefined) {
        const k = Math.min(1, t / (p.bendTime ?? 0.3));
        freq = p.freq + (p.bendTo - p.freq) * (1 - Math.pow(1 - k, 2));
      }
      phase += (2 * Math.PI * freq) / rate;
      out[i] += p.gain * Math.exp(-t / p.decay) * Math.sin(phase);
    }
  }
  for (let i = 0; i < length; i++) {
    const t = i / rate;
    low += 0.35 * (rand() - low); // a gentle low-pass on the noise
    out[i] += click.gain * Math.exp(-t / click.decay) * low;
  }
  // A 2 ms fade-in so the start does not click harder than intended.
  const fade = Math.min(length, Math.round(rate * 0.002));
  for (let i = 0; i < fade; i++) out[i] *= i / fade;
  return out;
}

/** One sound as samples at `rate` per second. */
export function renderSound(id: SoundId, rate: number): Float32Array {
  switch (id) {
    case 'accent':
      return membrane(rate, 0.06, [{ freq: 1760, gain: 0.9, decay: 0.012 }], { gain: 0.3, decay: 0.002 }, 1);
    case 'click':
      return membrane(rate, 0.05, [{ freq: 1175, gain: 0.6, decay: 0.01 }], { gain: 0.2, decay: 0.002 }, 2);
    case 'ta':
      return membrane(rate, 0.5, [
        { freq: 520, gain: 0.5, decay: 0.16 },
        { freq: 1040, gain: 0.25, decay: 0.1 },
        { freq: 1560, gain: 0.12, decay: 0.06 },
      ], { gain: 0.35, decay: 0.006 }, 3);
    case 'na':
      return membrane(rate, 0.6, [
        { freq: 520, gain: 0.25, decay: 0.2 },
        { freq: 1040, gain: 0.3, decay: 0.18 },
        { freq: 2080, gain: 0.15, decay: 0.1 },
      ], { gain: 0.2, decay: 0.004 }, 4);
    case 'ti':
      return membrane(rate, 0.12, [{ freq: 480, gain: 0.45, decay: 0.03 }], { gain: 0.45, decay: 0.01 }, 5);
    case 'ra':
      return membrane(rate, 0.1, [{ freq: 500, gain: 0.3, decay: 0.025 }], { gain: 0.35, decay: 0.008 }, 6);
    case 'te':
      return membrane(rate, 0.08, [{ freq: 380, gain: 0.25, decay: 0.015 }], { gain: 0.6, decay: 0.008 }, 7);
    case 'ka':
      return membrane(rate, 0.12, [{ freq: 140, gain: 0.5, decay: 0.035 }], { gain: 0.6, decay: 0.012 }, 8);
    case 'gha':
      return membrane(rate, 0.8, [
        { freq: 120, gain: 0.95, decay: 0.3, bendTo: 85, bendTime: 0.35 },
        { freq: 240, gain: 0.2, decay: 0.12, bendTo: 170, bendTime: 0.35 },
      ], { gain: 0.3, decay: 0.008 }, 9);
    case 'ga':
      return membrane(rate, 0.6, [
        { freq: 105, gain: 0.6, decay: 0.22, bendTo: 90, bendTime: 0.3 },
        { freq: 210, gain: 0.12, decay: 0.1 },
      ], { gain: 0.2, decay: 0.006 }, 10);
    case 'gin':
      return membrane(rate, 0.7, [
        { freq: 90, gain: 0.7, decay: 0.3, bendTo: 150, bendTime: 0.3 },
        { freq: 180, gain: 0.12, decay: 0.12, bendTo: 300, bendTime: 0.3 },
      ], { gain: 0.2, decay: 0.006 }, 11);
    // Kartal (#492): two small cymbals, bright inharmonic partials over a hiss; open rings, closed is damped at once.
    case 'kartal':
      return membrane(rate, 0.45, [
        { freq: 2960, gain: 0.22, decay: 0.22 },
        { freq: 4210, gain: 0.18, decay: 0.16 },
        { freq: 5730, gain: 0.12, decay: 0.12 },
        { freq: 7480, gain: 0.08, decay: 0.08 },
      ], { gain: 0.35, decay: 0.01 }, 13);
    case 'kartalClosed':
      return membrane(rate, 0.08, [
        { freq: 3150, gain: 0.16, decay: 0.018 },
        { freq: 5210, gain: 0.12, decay: 0.012 },
      ], { gain: 0.45, decay: 0.008 }, 14);
    case 'plain':
    default:
      return membrane(rate, 0.15, [{ freq: 400, gain: 0.4, decay: 0.04 }], { gain: 0.3, decay: 0.006 }, 12);
  }
}

const cache = new Map<string, Float32Array>();

/** The Guru's recorded strokes when chosen (lib/khol-samples.ts, #473): a stroke's samples, or null = synthesised. */
let recorded: ((id: SoundId, rate: number) => Float32Array | null) | null = null;
let version = 0;

/** Plays recorded strokes in place of the synthesised ones (null = synthesised again). */
export function setRecordedSounds(source: typeof recorded): void {
  recorded = source;
  version++;
}

/** Changes when the sounds change, so an engine that keeps prepared sounds prepares them again. */
export function soundsVersion(): number {
  return version;
}

/** renderSound (or the recorded stroke), kept after the first time. */
export function soundSamples(id: SoundId, rate: number): Float32Array {
  const real = recorded?.(id, rate);
  if (real && real.length > 0) return real;
  const key = `${id}@${rate}`;
  let samples = cache.get(key);
  if (!samples) {
    samples = renderSound(id, rate);
    cache.set(key, samples);
  }
  return samples;
}

/** The volume of each layer, 0-1 (#492); a layer not named plays at 1. */
export type LayerVolumes = Partial<Record<Layer, number>>;

/** How loud an event plays: 1 for the strokes, its layer's volume for a layer. */
export function eventGain(event: PatternEvent, volumes: LayerVolumes): number {
  return event.layer ? Math.min(1, Math.max(0, volumes[event.layer] ?? 1)) : 1;
}

/** One cycle of `pattern` at `bpm`, mixed, with the tails wrapped round to the start; layers at their volume. */
export function renderLoop(pattern: Pattern, bpm: number, rate: number, volumes: LayerVolumes = {}): Float32Array {
  const secondsPerBeat = 60 / bpm;
  const length = Math.round(pattern.beats * secondsPerBeat * rate);
  const out = new Float32Array(length);
  for (const event of pattern.events) {
    const gain = eventGain(event, volumes);
    if (gain === 0) continue;
    const samples = soundSamples(event.sound, rate);
    const start = Math.round(event.at * secondsPerBeat * rate);
    for (let i = 0; i < samples.length; i++) out[(start + i) % length] += gain * samples[i];
  }
  let peak = 0;
  for (let i = 0; i < length; i++) peak = Math.max(peak, Math.abs(out[i]));
  if (peak > 0.95) {
    const scale = 0.95 / peak;
    for (let i = 0; i < length; i++) out[i] *= scale;
  }
  return out;
}

/**
 * `pattern` once at `bpm`, mixed, its last sound left to ring out (no wrap): the count-in and a single stroke in the
 * step mode (#403, #404).
 */
export function renderOnce(pattern: Pattern, bpm: number, rate: number): Float32Array {
  const secondsPerBeat = 60 / bpm;
  const starts = pattern.events.map((event) => Math.round(event.at * secondsPerBeat * rate));
  const length = Math.max(
    Math.round(pattern.beats * secondsPerBeat * rate),
    ...pattern.events.map((event, i) => starts[i] + soundSamples(event.sound, rate).length),
  );
  const out = new Float32Array(length);
  pattern.events.forEach((event, i) => {
    const samples = soundSamples(event.sound, rate);
    for (let j = 0; j < samples.length; j++) out[starts[i] + j] += samples[j];
  });
  let peak = 0;
  for (let i = 0; i < length; i++) peak = Math.max(peak, Math.abs(out[i]));
  if (peak > 0.95) {
    const scale = 0.95 / peak;
    for (let i = 0; i < length; i++) out[i] *= scale;
  }
  return out;
}

/** Samples as a mono 16-bit PCM WAV file. */
export function wavFile(samples: Float32Array, rate: number): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) bytes[offset + i] = value.charCodeAt(i);
  };
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, Math.round(s * 32767), true);
  }
  return bytes;
}
