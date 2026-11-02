// Makes the two notification sounds of the Android app from the class's khol recordings (docs/DECISIONS.md #790,
// #793): assets/sounds/notification/khol_wake.wav, the wake-up alarm (a steady "te re khe ta | khe ta te re" phrase
// with ga under it, about 27 seconds, rising from soft to full), and khol_notify.wav, about 2 seconds for
// announcements and the practice reminder ("te re khe ta" quickly, then ga with ta). The expo-notifications plugin
// copies both into the APK's res/raw (app.json "sounds"), so a change here needs a new APK, never an OTA.
//
// Reproducible: the same recordings give the same files, byte for byte (no randomness, no clock). Run from app/:
//   node scripts/make-khol-alarm-sounds.mjs
// Then check the sizes and listen to both before committing. Kartal later: add its recording to STROKES and to the
// phrases below, run this again, and build a new APK (OPERATIONS "Notification sounds").

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const RATE = 22050; // the recordings' rate (#790): no resampling
const SOURCE = new URL('../assets/sounds/khol/', import.meta.url);
const TARGET = new URL('../assets/sounds/notification/', import.meta.url);

/** Reads a 16-bit mono PCM WAV with the plain 44-byte header the recordings have, as samples in -1..1. */
function readWav(name) {
  const bytes = readFileSync(new URL(`${name}.wav`, SOURCE));
  const ok =
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WAVE' &&
    bytes.readUInt16LE(20) === 1 &&
    bytes.readUInt16LE(22) === 1 &&
    bytes.readUInt32LE(24) === RATE &&
    bytes.readUInt16LE(34) === 16 &&
    bytes.toString('ascii', 36, 40) === 'data';
  if (!ok) throw new Error(`${name}.wav is not 16-bit mono PCM at ${RATE} Hz with a plain header`);
  const count = bytes.readUInt32LE(40) / 2;
  const samples = new Float64Array(count);
  for (let i = 0; i < count; i++) samples[i] = bytes.readInt16LE(44 + i * 2) / 32768;
  return samples;
}

/** Each stroke brought to the same peak, then its own loudness in the mix (re is about 7 dB under the others, #790). */
function stroke(name, gain) {
  const samples = readWav(name);
  const peak = samples.reduce((max, s) => Math.max(max, Math.abs(s)), 0) || 1;
  return samples.map((s) => (s / peak) * gain);
}

const STROKES = {
  te: stroke('te', 0.75),
  re: stroke('ra', 0.7),
  khe: stroke('ka', 0.8),
  ta: stroke('ta', 0.85),
  ga: stroke('ga', 0.9),
};

/** Mixes `hits` ([seconds, stroke, loudness]) into a track `seconds` long, with `envelope(t)` over it all. */
function mix(seconds, hits, envelope = () => 1) {
  const track = new Float64Array(Math.round(seconds * RATE));
  for (const [at, name, loudness] of hits) {
    const samples = STROKES[name];
    const start = Math.round(at * RATE);
    const gain = loudness * envelope(at);
    for (let i = 0; i < samples.length && start + i < track.length; i++) track[start + i] += samples[i] * gain;
  }
  return track;
}

/**
 * Brings the loudest moment to -1 dBFS, fades the last `fade` seconds out, and writes a 16-bit mono WAV. `drive`
 * above 0 first rounds the loudest strokes off (tanh), so the whole phrase sounds louder on a phone's small speaker
 * without clipping.
 */
function writeWav(file, track, fade = 0.03, drive = 0) {
  if (drive > 0) {
    const top = track.reduce((max, s) => Math.max(max, Math.abs(s)), 0) || 1;
    track = track.map((s) => Math.tanh((drive * s) / top));
  }
  const peak = track.reduce((max, s) => Math.max(max, Math.abs(s)), 0) || 1;
  const scale = 0.891 / peak;
  const fadeLength = Math.round(fade * RATE);
  const bytes = Buffer.alloc(44 + track.length * 2);
  bytes.write('RIFF', 0, 'ascii');
  bytes.writeUInt32LE(36 + track.length * 2, 4);
  bytes.write('WAVE', 8, 'ascii');
  bytes.write('fmt ', 12, 'ascii');
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20); // PCM
  bytes.writeUInt16LE(1, 22); // mono
  bytes.writeUInt32LE(RATE, 24);
  bytes.writeUInt32LE(RATE * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36, 'ascii');
  bytes.writeUInt32LE(track.length * 2, 40);
  for (let i = 0; i < track.length; i++) {
    const left = track.length - i;
    const tail = left < fadeLength ? left / fadeLength : 1;
    const value = Math.max(-1, Math.min(1, track[i] * scale * tail));
    bytes.writeInt16LE(Math.round(value * 32767), 44 + i * 2);
  }
  mkdirSync(TARGET, { recursive: true });
  writeFileSync(new URL(file, TARGET), bytes);
  console.log(`${file}: ${(track.length / RATE).toFixed(1)} s, ${Math.round(bytes.length / 1024)} KB`);
}

// The wake-up alarm: 84 beats a minute, two strokes a beat, eight strokes a cycle, nine cycles, then ga with ta on
// the next sam, left to ring. ga on the sam and softly on the sixth stroke gives the cycle its swing. It starts at
// 35 % and reaches full loudness after 8 seconds, so it wakes gently and then insists.
const BPM = 84;
const STEP = 60 / BPM / 2;
const PHRASE = ['te', 're', 'khe', 'ta', 'khe', 'ta', 'te', 're'];
const CYCLES = 9;
const wakeHits = [];
for (let cycle = 0; cycle < CYCLES; cycle++) {
  PHRASE.forEach((name, i) => {
    const at = (cycle * PHRASE.length + i) * STEP;
    // The first stroke of each pair a little stronger: te re | khe ta.
    wakeHits.push([at, name, i % 2 === 0 ? 1 : 0.8]);
    if (i === 0) wakeHits.push([at, 'ga', 1]);
    if (i === 5) wakeHits.push([at, 'ga', 0.55]);
  });
}
const wakeEnd = CYCLES * PHRASE.length * STEP;
wakeHits.push([wakeEnd, 'ga', 0.8], [wakeEnd, 'ta', 0.7]);
writeWav(
  'khol_wake.wav',
  mix(wakeEnd + 1.5, wakeHits, (t) => Math.min(1, 0.35 + (0.65 * t) / 8)),
  0.3,
  2,
);

// The notification sound: te re khe ta at four strokes a beat (about 100 a minute), then ga with ta, ringing out.
const QUICK = 0.15;
writeWav(
  'khol_notify.wav',
  mix(1.9, [
    [0, 'te', 0.9],
    [QUICK, 're', 0.75],
    [2 * QUICK, 'khe', 0.9],
    [3 * QUICK, 'ta', 0.8],
    [5 * QUICK, 'ga', 1],
    [5 * QUICK, 'ta', 0.9],
  ]),
  0.25,
  1.5,
);
