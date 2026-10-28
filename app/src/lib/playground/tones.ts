// Sounds the voice, kīrtan and instrument games make by arithmetic (docs/RHYTHM_PLAYGROUND.md §7.5, §7.7, §7.9,
// §11.1; docs/DECISIONS.md #761): reference notes on "aa" and a soft drone for Voice Companion and Vocal Sādhana
// Studio (no recording needed: the tonic is a number), and — until the team's and Prji's recordings are approved —
// TEST stand-ins for instrument clips (mṛdaṅga strokes, kartāl, a harmonium-like reed) and a short TEST kīrtan
// (a sung line, kartāl on the pulse, the khol joining at a known sam) whose beat grid is exact by construction.
//
// A TEST sound is a play_assets row with no file and a bundled key `synth:<what>`; a recorded clip has a path in
// the bucket instead and replaces it without any code change. Keys:
//   synth:tone:0        one note, semitones above the student's tonic (0 = Sa, 7 = Pa, 12 = upper Sa)
//   synth:tone:0,2,4    a short phrase of notes
//   synth:instrument:kartal+harmonium   one instrument or several together
//   synth:kirtan:slow | synth:kirtan:medium   the TEST kīrtan at 60 or 80 beats a minute
//
// Pure functions (no audio API), so `npm test` checks them; the players are clip-player(.web).ts.

import { renderSound, wavFile } from '../practice-sounds';

/** Samples a second for every generated sound: as the practice sounds (lib/practice-audio.ts). */
export const TONE_RATE = 22050;

/** The voice ranges a student picks from (§7.5): a comfortable Sa for each, TEST defaults until Prji sets the tonics. */
export type VoiceRange = 'child' | 'higher' | 'lower';
export const VOICE_RANGES: readonly VoiceRange[] = ['child', 'higher', 'lower'];
export const RANGE_TONIC_HZ: Readonly<Record<VoiceRange, number>> = { child: 261.63, higher: 207.65, lower: 138.59 };

/** The TEST instruments of Sound Explorer, as play_assets.instruments names them. */
export const TEST_INSTRUMENTS = ['mridanga', 'kartal', 'harmonium'] as const;

/** The note `semitones` above (or below) a tonic, in Hz. */
export function noteHz(tonicHz: number, semitones: number): number {
  return tonicHz * Math.pow(2, semitones / 12);
}

/** How far `hz` is from `targetHz`, in cents (100 = a semitone); positive = higher. */
export function centsOff(hz: number, targetHz: number): number {
  return 1200 * Math.log2(hz / targetHz);
}

/** Linear fades at both ends, so nothing clicks. */
function fade(out: Float32Array, rate: number, inMs: number, outMs: number): Float32Array {
  const a = Math.min(out.length, Math.round((rate * inMs) / 1000));
  const b = Math.min(out.length, Math.round((rate * outMs) / 1000));
  for (let i = 0; i < a; i++) out[i] *= i / a;
  for (let i = 0; i < b; i++) out[out.length - 1 - i] *= i / b;
  return out;
}

/** Mixes `src` into `out` from sample `at`, times `gain`. */
function mixAt(out: Float32Array, src: Float32Array, at: number, gain = 1): void {
  for (let i = 0; i < src.length && at + i < out.length; i++) if (at + i >= 0) out[at + i] += src[i] * gain;
}

/** Scales so the loudest sample is `peak` (never louder than it was asked to be). */
export function normalise(out: Float32Array, peak = 0.8): Float32Array {
  let max = 0;
  for (let i = 0; i < out.length; i++) max = Math.max(max, Math.abs(out[i]));
  if (max > 0) for (let i = 0; i < out.length; i++) out[i] *= peak / max;
  return out;
}

/** A gentle sung "aa": a sine with two soft harmonics and a slow, small vibrato. */
export function renderVoiceTone(hz: number, ms: number, rate = TONE_RATE): Float32Array {
  const out = new Float32Array(Math.max(1, Math.round((rate * ms) / 1000)));
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / rate;
    const f = hz * (1 + 0.004 * Math.sin(2 * Math.PI * 5 * t) * Math.min(1, t / 0.6));
    phase += (2 * Math.PI * f) / rate;
    out[i] = 0.6 * Math.sin(phase) + 0.25 * Math.sin(2 * phase) + 0.1 * Math.sin(3 * phase);
  }
  return normalise(fade(out, rate, 60, 120), 0.6);
}

/** Notes one after another (a two-note step or a short phrase), each `noteMs` long. */
export function renderPhrase(tonicHz: number, semitones: readonly number[], noteMs: number, rate = TONE_RATE): Float32Array {
  const step = Math.round((rate * noteMs) / 1000);
  const out = new Float32Array(Math.max(1, step * semitones.length));
  semitones.forEach((s, n) => mixAt(out, renderVoiceTone(noteHz(tonicHz, s), noteMs, rate), n * step));
  return normalise(out, 0.6);
}

/** A soft drone: Pa, upper Sa, upper Sa, Sa plucked in turn (a tānpurā's order), each ringing on. */
export function renderDrone(tonicHz: number, ms: number, rate = TONE_RATE): Float32Array {
  const out = new Float32Array(Math.max(1, Math.round((rate * ms) / 1000)));
  const order = [7, 12, 12, 0];
  const every = Math.round(rate * 0.9);
  for (let n = 0, at = 0; at < out.length; n++, at += every) {
    const f = noteHz(tonicHz / 2, order[n % order.length]);
    const len = Math.min(out.length - at, Math.round(rate * 3.2));
    for (let i = 0; i < len; i++) {
      const t = i / rate;
      const env = Math.exp(-t / 1.4) * Math.min(1, t / 0.02);
      const p = 2 * Math.PI * f * t;
      out[at + i] += env * (0.5 * Math.sin(p) + 0.3 * Math.sin(2 * p) + 0.2 * Math.sin(3 * p) + 0.12 * Math.sin(4 * p));
    }
  }
  return normalise(fade(out, rate, 200, 300), 0.35);
}

/** A reed held on one note (harmonium-like): many odd and even harmonics, softly rising. */
function reed(hz: number, ms: number, rate: number): Float32Array {
  const out = new Float32Array(Math.max(1, Math.round((rate * ms) / 1000)));
  for (let i = 0; i < out.length; i++) {
    const t = i / rate;
    let v = 0;
    for (let h = 1; h <= 8; h++) v += Math.sin(2 * Math.PI * hz * h * t) / h;
    out[i] = v * Math.min(1, t / 0.08);
  }
  return fade(out, rate, 10, 80);
}

/** One TEST instrument playing alone for `ms` at `bpm`: strokes, kartāl or a reed melody. */
export function renderInstrument(name: string, ms: number, bpm = 90, rate = TONE_RATE): Float32Array {
  const out = new Float32Array(Math.max(1, Math.round((rate * ms) / 1000)));
  const beat = Math.round((rate * 60) / bpm);
  if (name === 'kartal') {
    const open = renderSound('kartal', rate);
    const closed = renderSound('kartalClosed', rate);
    for (let n = 0; n * beat < out.length; n++) mixAt(out, n % 2 === 0 ? open : closed, n * beat, n % 4 === 0 ? 1 : 0.7);
  } else if (name === 'harmonium') {
    const tune = [0, 2, 4, 2, 0, -1, 0, 0];
    for (let n = 0; n * beat < out.length; n++) mixAt(out, reed(noteHz(220, tune[n % tune.length]), (beat / rate) * 1000, rate), n * beat, 0.5);
  } else {
    // mridanga (and anything not known yet): a simple stroke pattern.
    const order: ('gha' | 'ta' | 'na' | 'ka')[] = ['gha', 'ta', 'na', 'ta', 'ka', 'ta', 'na', 'ta'];
    for (let n = 0; n * beat < out.length; n++) mixAt(out, renderSound(order[n % order.length], rate), n * beat);
  }
  return normalise(out, 0.7);
}

/** Several TEST instruments together, each at the same loudness. */
export function renderEnsemble(names: readonly string[], ms: number, bpm = 90, rate = TONE_RATE): Float32Array {
  const out = new Float32Array(Math.max(1, Math.round((rate * ms) / 1000)));
  for (const name of names) mixAt(out, renderInstrument(name, ms, bpm, rate), 0, 1 / Math.max(1, names.length));
  return normalise(out, 0.8);
}

/** A kīrtan clip's annotation (play_assets.beat_grid), as beat-grid.ts reads it. */
export type KirtanGridJson = { sam_ms: number[]; beats: number; bpm: number; entries_ms: number[]; tempo_changes: { at_ms: number; bpm: number }[] };

/** The TEST kīrtan's shape: 8 beats a cycle, four cycles, the khol joining at the third sam. */
export const TEST_KIRTAN = { beats: 8, cycles: 4, entryCycle: 2, bpm: { slow: 60, medium: 80 } } as const;

/**
 * The TEST kīrtan: a sung line (one note a beat, a call in cycles 1-2, the same line again), kartāl on every beat
 * (louder at sam), and mṛdaṅga strokes from the entry sam on. The grid is where those sounds were put, so a
 * test can check it to the sample.
 */
export function renderTestKirtan(tempo: 'slow' | 'medium', tonicHz = RANGE_TONIC_HZ.higher, rate = TONE_RATE): { samples: Float32Array; grid: KirtanGridJson } {
  const bpm = TEST_KIRTAN.bpm[tempo];
  const beatMs = 60000 / bpm;
  const total = TEST_KIRTAN.beats * TEST_KIRTAN.cycles;
  const out = new Float32Array(Math.round((rate * total * beatMs) / 1000) + rate);
  const at = (b: number) => Math.round((rate * b * beatMs) / 1000);
  const line = [0, 2, 4, 4, 2, 0, -1, 0];
  const kartal = renderSound('kartal', rate);
  for (let b = 0; b < total; b++) {
    mixAt(out, renderVoiceTone(noteHz(tonicHz, line[b % line.length]), beatMs * 0.95, rate), at(b), 0.5);
    mixAt(out, kartal, at(b), b % TEST_KIRTAN.beats === 0 ? 0.6 : 0.3);
  }
  const strokes: ('gha' | 'ta' | 'na')[] = ['gha', 'ta', 'na', 'ta'];
  for (let b = TEST_KIRTAN.entryCycle * TEST_KIRTAN.beats; b < total; b++) mixAt(out, renderSound(strokes[b % 4], rate), at(b), 0.6);
  const samMs = Array.from({ length: TEST_KIRTAN.cycles }, (_, c) => Math.round(c * TEST_KIRTAN.beats * beatMs));
  return {
    samples: normalise(fade(out, rate, 5, 400), 0.8),
    grid: { sam_ms: samMs, beats: TEST_KIRTAN.beats, bpm, entries_ms: [samMs[TEST_KIRTAN.entryCycle]], tempo_changes: [] },
  };
}

/** What a `synth:` key asks for, or null for a key this app does not know. */
export type SynthSpec =
  | { kind: 'tone'; semitones: number[] }
  | { kind: 'instrument'; names: string[] }
  | { kind: 'kirtan'; tempo: 'slow' | 'medium' };

export function parseSynthKey(key: string | null | undefined): SynthSpec | null {
  const m = /^synth:(tone|instrument|kirtan):(.+)$/.exec(key ?? '');
  if (!m) return null;
  if (m[1] === 'tone') {
    const semitones = m[2].split(',').map((s) => Number(s.trim()));
    return semitones.length > 0 && semitones.length <= 8 && semitones.every((s) => Number.isInteger(s) && Math.abs(s) <= 24)
      ? { kind: 'tone', semitones }
      : null;
  }
  if (m[1] === 'instrument') {
    const names = m[2].split('+').map((s) => s.trim()).filter(Boolean);
    return names.length > 0 && names.length <= 4 && names.every((n) => /^[a-z_]{2,30}$/.test(n)) ? { kind: 'instrument', names } : null;
  }
  return m[2] === 'slow' || m[2] === 'medium' ? { kind: 'kirtan', tempo: m[2] } : null;
}

/** Options a game passes when it renders a `synth:` sound. */
export type SynthOptions = { tonicHz?: number; noteMs?: number; clipMs?: number };

/** Renders a `synth:` key to samples (and the kīrtan's grid); null for an unknown key. */
export function renderSynth(key: string, opts: SynthOptions = {}, rate = TONE_RATE): { samples: Float32Array; grid: KirtanGridJson | null } | null {
  const spec = parseSynthKey(key);
  if (!spec) return null;
  if (spec.kind === 'tone') {
    return { samples: renderPhrase(opts.tonicHz ?? RANGE_TONIC_HZ.higher, spec.semitones, opts.noteMs ?? 2000, rate), grid: null };
  }
  if (spec.kind === 'instrument') return { samples: renderEnsemble(spec.names, opts.clipMs ?? 4000, 90, rate), grid: null };
  return renderTestKirtan(spec.tempo, opts.tonicHz, rate);
}

/** A rendered sound as a WAV file's bytes (for the phone's player). */
export function toWav(samples: Float32Array, rate = TONE_RATE): Uint8Array {
  return wavFile(samples, rate);
}
