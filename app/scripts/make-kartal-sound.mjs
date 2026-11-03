// Makes the kartal notification sound of the Android app (docs/DECISIONS.md #803): assets/sounds/notification/
// kartal_notify.wav, about 1.2 s: two small brass cymbals struck twice, "cha-ching", a bright metallic ring that dies
// away. Synthesised (no recording of the class's kartals yet, OPERATIONS "Notification sounds"): for each cymbal a set
// of inharmonic partials, each as two slightly detuned sines (the two cymbals never ring at exactly one pitch, which
// gives the shimmer), over a short hiss of the strike. Same format as the khol files (#793): 22.05 kHz, 16-bit, mono,
// a plain 44-byte header, a lowercase name (an Android resource name). The expo-notifications plugin copies it into the
// APK's res/raw (app.json "sounds"), so a change here needs a new APK and a new channel id, never an OTA.
//
// Reproducible: no randomness from the clock (a fixed-seed noise), the same file byte for byte on every run. From app/:
//   node scripts/make-kartal-sound.mjs

import { mkdirSync, writeFileSync } from 'node:fs';

const RATE = 22050;
const SECONDS = 1.2;
const TARGET = new URL('../assets/sounds/notification/', import.meta.url);

/** A cymbal's partials: frequency (Hz, all below the 11 kHz limit of 22.05 kHz), loudness, ring time (s). */
const PARTIALS = [
  { freq: 2960, gain: 0.3, decay: 0.42 },
  { freq: 4210, gain: 0.24, decay: 0.3 },
  { freq: 5730, gain: 0.17, decay: 0.22 },
  { freq: 7480, gain: 0.1, decay: 0.14 },
  { freq: 9120, gain: 0.05, decay: 0.09 },
];
/** How far apart the two cymbals' pitches are (a ratio): about 7 Hz of beating at 3 kHz. */
const DETUNE = 1.0024;

/** A fixed-seed noise source (a linear congruential generator), -1..1. */
function noise(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x80000000 - 1;
  };
}

/** One strike at `at` seconds, `level` 0..1, added into `out`. */
function strike(out, at, level, seed) {
  const start = Math.round(at * RATE);
  const hiss = noise(seed);
  let previous = 0;
  for (let i = 0; start + i < out.length; i++) {
    const t = i / RATE;
    // A 4 ms rise: a click-free, quiet start even though the strike is sharp.
    const rise = Math.min(1, t / 0.004);
    let value = 0;
    for (const p of PARTIALS) {
      const ring = Math.exp(-t / p.decay);
      value += p.gain * ring * (Math.sin(2 * Math.PI * p.freq * t) + Math.sin(2 * Math.PI * p.freq * DETUNE * t + 1.3)) * 0.5;
    }
    // The strike's hiss, high-passed (the difference of two samples) so it is bright, gone after ~30 ms.
    const raw = hiss();
    value += 0.35 * Math.exp(-t / 0.012) * (raw - previous) * 0.5;
    previous = raw;
    out[start + i] += level * rise * value;
  }
}

const samples = new Float64Array(Math.round(SECONDS * RATE));
strike(samples, 0, 0.75, 7); // cha: the lighter first touch
strike(samples, 0.16, 1, 11); // ching: the full strike, left to ring

// The last 80 ms fade to silence, then the whole sound is scaled to a peak of 0.7 (about -3 dB): loud, never clipped.
const fade = Math.round(0.08 * RATE);
for (let i = 0; i < fade; i++) samples[samples.length - 1 - i] *= i / fade;
let peak = 0;
for (const value of samples) peak = Math.max(peak, Math.abs(value));
const scale = 0.7 / peak;

const data = Buffer.alloc(samples.length * 2);
samples.forEach((value, i) => data.writeInt16LE(Math.round(value * scale * 32767), i * 2));
const header = Buffer.alloc(44);
header.write('RIFF', 0, 'ascii');
header.writeUInt32LE(36 + data.length, 4);
header.write('WAVE', 8, 'ascii');
header.write('fmt ', 12, 'ascii');
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20); // PCM
header.writeUInt16LE(1, 22); // mono
header.writeUInt32LE(RATE, 24);
header.writeUInt32LE(RATE * 2, 28);
header.writeUInt16LE(2, 32);
header.writeUInt16LE(16, 34);
header.write('data', 36, 'ascii');
header.writeUInt32LE(data.length, 40);

mkdirSync(TARGET, { recursive: true });
writeFileSync(new URL('kartal_notify.wav', TARGET), Buffer.concat([header, data]));
console.log(`kartal_notify.wav: ${SECONDS} s, ${(44 + data.length).toLocaleString('en')} bytes, peak 0.70`);
