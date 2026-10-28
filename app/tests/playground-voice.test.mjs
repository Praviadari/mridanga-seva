// Unit tests for the Rhythm Playground's voice, kīrtan and instrument games (docs/RHYTHM_PLAYGROUND.md §7.5, §7.7,
// §7.9, §7.13, §7.14; docs/DECISIONS.md #760-#766): the generated TEST sounds and their keys, the kīrtan beat grid
// (entry within half a beat, pulse timing, the TEST kīrtan's sounds where its grid says), the on-device pitch estimate
// and its words, and Sound Explorer rounds with instruments together. The database side (0069, the W5 TEST seed) is
// in supabase/tests/smoke-test.mjs. Run from app/: npm test.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import './stubs/register.mjs';

const tones = await import('../src/lib/playground/tones.ts');
const grid = await import('../src/lib/playground/beat-grid.ts');
const pitch = await import('../src/lib/pitch-estimate.ts');
const { generateRound } = await import('../src/lib/playground/generator.ts');
const { isRight } = await import('../src/lib/playground/check.ts');
const { DEFAULT_LABEL_RULES } = await import('../src/lib/playground/labels.ts');

const RATE = tones.TONE_RATE;

test('notes and cents: Pa is a fifth above Sa, an octave is 1200 cents', () => {
  assert.ok(Math.abs(tones.noteHz(200, 7) - 299.66) < 0.01);
  assert.equal(Math.round(tones.centsOff(440, 220)), 1200);
  assert.equal(Math.round(tones.centsOff(tones.noteHz(220, 1), 220)), 100);
});

test('synth keys: tones, instruments and kirtans are read; anything else is refused', () => {
  assert.deepEqual(tones.parseSynthKey('synth:tone:0,2,4'), { kind: 'tone', semitones: [0, 2, 4] });
  assert.deepEqual(tones.parseSynthKey('synth:instrument:kartal+mridanga'), { kind: 'instrument', names: ['kartal', 'mridanga'] });
  assert.deepEqual(tones.parseSynthKey('synth:kirtan:slow'), { kind: 'kirtan', tempo: 'slow' });
  for (const bad of ['synth:tone:x', 'synth:tone:30', 'synth:kirtan:fast', 'tone:0', 'synth:instrument:Kartal', null, undefined, 'ta']) {
    assert.equal(tones.parseSynthKey(bad), null, String(bad));
  }
});

test('generated sounds have the asked length, never clip, and the same key gives the same samples', () => {
  const note = tones.renderSynth('synth:tone:0', { tonicHz: 200, noteMs: 1500 });
  assert.equal(note.samples.length, Math.round(RATE * 1.5));
  const peak = (s) => s.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  for (const key of ['synth:tone:0,2,4,2,0', 'synth:instrument:harmonium+kartal', 'synth:instrument:mridanga', 'synth:kirtan:medium']) {
    const s = tones.renderSynth(key).samples;
    assert.ok(peak(s) <= 0.81 && peak(s) > 0.1, key);
  }
  assert.deepEqual(tones.renderSynth('synth:instrument:kartal').samples, tones.renderSynth('synth:instrument:kartal').samples);
  const drone = tones.renderDrone(150, 2000);
  assert.equal(drone.length, RATE * 2);
  assert.ok(peak(drone) <= 0.36);
});

test('the TEST kirtan: its grid is the one the W5 seed stores, and a sound starts at every sam', () => {
  const seed = {
    slow: { sam_ms: [0, 8000, 16000, 24000], beats: 8, bpm: 60, entries_ms: [16000], tempo_changes: [] },
    medium: { sam_ms: [0, 6000, 12000, 18000], beats: 8, bpm: 80, entries_ms: [12000], tempo_changes: [] },
  };
  for (const tempo of ['slow', 'medium']) {
    const { samples, grid: g } = tones.renderTestKirtan(tempo);
    assert.deepEqual(g, seed[tempo]);
    const level = (fromMs, toMs) => {
      let sum = 0;
      const a = Math.round((fromMs * RATE) / 1000);
      const b = Math.round((toMs * RATE) / 1000);
      for (let i = a; i < b; i++) sum += Math.abs(samples[i] ?? 0);
      return sum / Math.max(1, b - a);
    };
    // §7.7 acceptance: the annotated sam lines up with the audio within 20 ms.
    for (const sam of g.sam_ms.slice(1)) assert.ok(level(sam, sam + 20) > 1.5 * level(sam - 40, sam - 20), `${tempo} sam ${sam}`);
    assert.ok(samples.length >= ((g.sam_ms[3] + (60000 / g.bpm) * 8) * RATE) / 1000);
  }
});

test('beat grid: read only when usable', () => {
  assert.equal(grid.parseGrid(null), null);
  assert.equal(grid.parseGrid({ sam_ms: [], beats: 8 }), null);
  assert.equal(grid.parseGrid({ sam_ms: [0], beats: 8 }), null, 'one sam and no tempo: the cycle length is unknown');
  assert.equal(grid.parseGrid({ sam_ms: [0, 100], beats: 8 }), null, 'sams closer than 100 ms a beat');
  assert.equal(grid.parseGrid({ sam_ms: [0, 8000], beats: 1 }), null);
  const g = grid.parseGrid({ sam_ms: [8000, 0], beats: 8, entries_ms: [16000, 'x'], tempo_changes: [{ at_ms: 1, bpm: 500 }] });
  assert.deepEqual(g, { samMs: [0, 8000], beats: 8, bpm: null, entriesMs: [16000], tempoChanges: [] });
});

test('beat grid: beats, where a time is, entry within half a beat, replay a cycle before', () => {
  const g = grid.parseGrid({ sam_ms: [0, 8000, 16000], beats: 8, bpm: 60, entries_ms: [16000] });
  assert.deepEqual(grid.beatTimes(g, 3000), [0, 1000, 2000, 3000]);
  assert.equal(grid.beatTimes(g, 30000).length, 31, 'after the last sam the beats go on at the last cycle');
  assert.deepEqual(grid.beatAt(g, 8100), { cycle: 1, beat: 1, sam: true });
  assert.deepEqual(grid.beatAt(g, 10500), { cycle: 1, beat: 3, sam: false });
  assert.equal(grid.beatAt(g, -5), null);
  assert.deepEqual(grid.entryResult(g, 16400), { found: true, entryMs: 16000, errorMs: 400 });
  assert.equal(grid.entryResult(g, 16500).found, true, 'exactly half a beat');
  assert.equal(grid.entryResult(g, 16501).found, false);
  assert.deepEqual(grid.entryResult(g, 15200), { found: false, entryMs: 16000, errorMs: -800 });
  assert.equal(grid.entryResult(g, 16300, 200).errorMs, 100, 'the tuned delay is taken off');
  assert.equal(grid.entryResult({ ...g, entriesMs: [] }, 1000), null);
  assert.equal(grid.replayFrom(g, 16000), 8000);
  assert.equal(grid.replayFrom(g, 2000), 0);
});

test('pulse taps: median and spread against the nearest beats; too few taps say nothing', () => {
  const g = grid.parseGrid({ sam_ms: [0, 8000], beats: 8, bpm: 60, entries_ms: [] });
  assert.equal(grid.pulseStats(g, [1000, 2000]), null);
  const steadyLate = grid.pulseStats(g, [1030, 2030, 3030, 4030]);
  assert.deepEqual(steadyLate, { taps: 4, medianMs: 30, spreadMs: 0 });
  const tuned = grid.pulseStats(g, [1030, 2030, 3030, 4030], 30);
  assert.equal(tuned.medianMs, 0);
  const wobbly = grid.pulseStats(g, [1000, 2100, 2900, 4050, 4950]);
  assert.equal(wobbly.medianMs, 0);
  assert.equal(wobbly.spreadMs, 50);
});

/** A sung-like frame: a fundamental with two harmonics. */
function voiceFrame(hz, rate = 44100, n = 2048) {
  const f = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = (2 * Math.PI * hz * i) / rate;
    f[i] = 0.4 * Math.sin(p) + 0.2 * Math.sin(2 * p) + 0.1 * Math.sin(3 * p);
  }
  return f;
}

test('pitch estimate (YIN): finds a voice\'s note within 1 %, says nothing for silence or noise', () => {
  for (const hz of [110, 196, 261.63, 440, 660]) {
    const e = pitch.estimatePitch(voiceFrame(hz), 44100);
    assert.ok(e && Math.abs(e.hz - hz) / hz < 0.01 && e.clarity > 0.8, `${hz}: ${JSON.stringify(e)}`);
  }
  assert.equal(pitch.estimatePitch(new Float32Array(2048), 44100), null);
  let seed = 7;
  const noise = Float32Array.from({ length: 2048 }, () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32 - 0.5) * 0.6);
  assert.equal(pitch.estimatePitch(noise, 44100), null);
  // The app's own reference tone is read back as its note.
  const tone = tones.renderVoiceTone(220, 500, 22050).slice(4000, 4000 + 1024);
  assert.ok(Math.abs(pitch.estimatePitch(tone, 22050).hz - 220) < 3);
});

test('pitch words: close within a quarter tone, an octave away is the same note, never more than three words', () => {
  assert.equal(pitch.pitchWord(220, 220), 'close');
  assert.equal(pitch.pitchWord(226, 220), 'close');
  assert.equal(pitch.pitchWord(235, 220), 'higher');
  assert.equal(pitch.pitchWord(205, 220), 'lower');
  assert.equal(pitch.pitchWord(441, 220), 'close', 'a child an octave up matches');
  assert.equal(pitch.steadyPitch([{ hz: 220, clarity: 0.9 }, { hz: 222, clarity: 0.9 }]), null, 'too few clear frames');
  assert.equal(pitch.steadyPitch([{ hz: 220, clarity: 0.9 }, { hz: 500, clarity: 0.3 }, { hz: 222, clarity: 0.9 }, { hz: 221, clarity: 0.95 }]), 221);
});

/** A small pack with the W5 seed's Sound Explorer items. */
function explorerPack() {
  const names = [['mridanga'], ['kartal'], ['harmonium'], ['kartal', 'mridanga'], ['harmonium', 'kartal']];
  return {
    version: 4,
    publishedAt: '2026-10-28T00:00:00Z',
    placeholders: true,
    bols: [],
    assets: names.map((inst, i) => ({ id: 100 + i, kind: 'instrument', path: null, bundledKey: `synth:instrument:${inst.join('+')}`, mime: null,
      durationMs: 4000, bpm: null, beatGrid: null, instruments: inst, licence: 'own', performer: 'TEST', credit: null, placeholder: true })),
    templates: [{ id: 9, game: 'sound_explorer', skill: 'listen.instrument', responseMode: 'choose', levelMin: 1, levelMax: 3,
      steps: [{ step: 1, choices: 2 }, { step: 2, choices: 3 }], params: { roundLen: 5 }, revision: 1 }],
    exercises: names.map((inst, i) => ({ id: 200 + i, game: 'sound_explorer', templateId: 9, levelId: 1, skills: ['listen.instrument'],
      taalId: null, sequence: null, divisions: null, answer: { instruments: inst }, distractors: [], promptAssets: [100 + i], bpmMin: null,
      bpmMax: null, guna: [1], requiresItem: null, locale: 'en', attribution: null, placeholder: true, revision: 1 })),
    labels: DEFAULT_LABEL_RULES,
  };
}

test('Sound Explorer: instruments together are one card each, never dropped; the answer is a set (#760)', () => {
  const round = generateRound({ pack: explorerPack(), levelId: 1, levelUpOk: false, ticked: [], game: 'sound_explorer', step: 2, seed: 760,
    mode: 'play', seen: [], now: Date.parse('2026-10-28T10:00:00Z') });
  assert.equal(round.dropped.length, 0, JSON.stringify(round.dropped));
  assert.equal(round.challenges.length, 5);
  for (const c of round.challenges) {
    const parts = c.answer.split(' ');
    assert.ok(parts.every((p) => c.choices.some((k) => k.key === p)), `${c.answer} in ${c.choices.map((k) => k.key)}`);
    assert.ok(c.choices.length >= Math.max(2, parts.length));
    assert.equal(c.prompt.assets.length, 1);
  }
  assert.equal(isRight('sound_explorer', 'kartal mridanga', 'mridanga kartal'), true);
  assert.equal(isRight('sound_explorer', 'kartal mridanga', 'kartal'), false);
});
