// Unit tests for the Rhythm Playground's rhythm games and the Daily Sādhana Quest (docs/DECISIONS.md #750-#755;
// docs/RHYTHM_PLAYGROUND.md §7.2, §7.3, §7.10-§7.12, §7.15): pulse and evenness grading (taps in silent cycles graded
// against the hidden pulse; no timing word on a phone not tuned), guna sections with the same pulse in every section,
// Echo calls with an answer window exactly as long as the call, the Tāla Cycle questions (never at sam, counted from 1,
// replayed alike from the seed), the approved guna orders under their tempo caps, and the quest's lines (balanced,
// different across 7 days, never yesterday's pair). Run from app/: npm test.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import './stubs/register.mjs';

const grading = await import('../src/lib/tap-grading.ts');
const pattern = await import('../src/lib/practice-pattern.ts');
const echo = await import('../src/lib/echo.ts');
const rhythm = await import('../src/lib/playground-games/rhythm.ts');
const today = await import('../src/lib/today-practice.ts');
const cat = await import('../src/lib/playground-games/catalogue.ts');
const { makeRng, roundSeed } = await import('../src/lib/playground/rng.ts');

const src = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const locale = (lang) => JSON.parse(src(`i18n/locales/${lang}.json`));

const BPM = 60; // 1000 ms a beat

// ---------------------------------------------------------------- Tap the Beat: pulse and evenness

test('steady taps on every beat are "Steady"; early ones "A little rushed"; late ones "A little slow"', () => {
  const pulses = grading.pulsesOf(4, 2);
  assert.deepEqual(pulses, [0, 1, 2, 3, 4, 5, 6, 7]);
  const steady = grading.gradePulse(pulses.map((p) => p + 0.01), pulses, BPM);
  assert.equal(steady.verdict, 'steady');
  assert.equal(steady.tapped, 8);
  assert.equal(steady.medianMs, 10);
  assert.equal(steady.spreadMs, 0);
  assert.equal(grading.gradePulse(pulses.map((p) => p - 0.1), pulses, BPM).verdict, 'rushed');
  assert.equal(grading.gradePulse(pulses.map((p) => p + 0.1), pulses, BPM).verdict, 'slow');
  // Relaxed timing (a facilitator's setting) widens "Steady".
  assert.equal(grading.gradePulse(pulses.map((p) => p + 0.07), pulses, BPM, true).verdict, 'steady');
});

test('a pulse takes one tap; far and second taps are stray; missed pulses are rings on the line', () => {
  const pulses = [0, 1, 2, 3];
  const r = grading.gradePulse([0, 0.05, 1.5, 3], pulses, BPM);
  assert.equal(r.tapped, 2);
  assert.equal(r.stray, 2);
  assert.deepEqual(r.errorsMs, [0, null, null, 0]);
  assert.equal(r.share, 0.5);
  assert.equal(grading.gradePulse([], pulses, BPM).verdict, null);
});

test('taps in silent cycles are graded against the hidden pulse (§7.2 acceptance)', () => {
  const run = rhythm.pulseRun(4, { step: 3, mute: 1, cycles: 4 });
  assert.equal(run.cycles, 4);
  assert.equal(run.pattern.beats, 8); // one sounding + one silent cycle per loop
  assert.ok(run.pattern.events.every((e) => e.at < 4), 'the second cycle of the loop is silent');
  const pulses = grading.pulsesOf(4, run.cycles);
  assert.equal(pulses.length, 16);
  const r = grading.gradePulse(pulses.slice(4, 8).map((p) => p + 0.02), pulses, BPM);
  assert.equal(r.tapped, 4);
  assert.deepEqual(r.errorsMs.slice(4, 8), [20, 20, 20, 20]);
});

test('clicks only on sam keep one click a cycle; the guide can be hidden', () => {
  const run = rhythm.pulseRun(8, { step: 4, samOnly: true, guide: false });
  assert.equal(run.pattern.events.length, 1);
  assert.equal(run.pattern.events[0].at, 0);
  assert.equal(run.guide, false);
});

test('a phone not tuned: practice only — no right or wrong is kept', () => {
  const pulses = [0, 1, 2, 3];
  const r = grading.gradePulse(pulses, pulses, BPM);
  assert.equal(grading.pulseKept(r, false), null);
  assert.equal(grading.pulseKept(r, true), true);
  assert.equal(grading.pulseKept(grading.gradePulse([0], pulses, BPM), true), false);
});

test('errorSummary: middle value and interquartile spread', () => {
  assert.deepEqual(grading.errorSummary([-20, 0, 10, 20, 100]), { medianMs: 10, spreadMs: 20 });
  assert.equal(grading.errorSummary([]), null);
});

// ---------------------------------------------------------------- Rhythm Switching: guna sections

test('guna sections: the pulse is identical in every section; strokes per beat = guna', () => {
  const bols = ['te', 're', 'khe', 'ta'];
  const { pattern: p, places } = pattern.gunaSections(bols, [
    { guna: 1, cycles: 2 },
    { guna: 2, cycles: 2 },
    { guna: 4, cycles: 2 },
    { guna: 1, cycles: 2 },
  ]);
  assert.equal(p.beats, 32);
  assert.deepEqual(places.map((s) => [s.guna, s.start, s.length]), [[1, 0, 8], [2, 8, 8], [4, 16, 8], [1, 24, 8]]);
  // Every beat of every section starts with a stroke exactly on the beat.
  for (let beat = 0; beat < 32; beat++) assert.ok(p.events.some((e) => Math.abs(e.at - beat) < 1e-9), `stroke on beat ${beat}`);
  const inBeat = (b) => p.events.filter((e) => e.at >= b && e.at < b + 1).length;
  assert.equal(inBeat(0), 1);
  assert.equal(inBeat(8), 2);
  assert.equal(inBeat(16), 4);
  assert.equal(inBeat(24), 1);
  // Guna 8 is the same bols eight to a beat.
  const eight = pattern.gunaSections(bols, [{ guna: 8, cycles: 1 }]).pattern;
  assert.equal(eight.events.filter((e) => e.at < 1).length, 8);
  assert.equal(pattern.sectionAt(places, 17.5)?.guna, 4);
});

test('switch orders: only approved ones, only playable guna; guna 8 never above its cap', () => {
  const template = { params: { orders: [[1, 2, 4, 1], [1, 2, 8, 1], [1, 3, 1]], gunaBpmMax: { 8: 60, 4: 90 }, cyclesPerSection: 2 } };
  assert.deepEqual(rhythm.playableGuna([1, 2, 4, 8], template, 70), [1, 2, 4]);
  assert.deepEqual(rhythm.playableGuna([1, 2, 4, 8], template, 60), [1, 2, 4, 8]);
  assert.deepEqual(rhythm.switchOrders(template, [1, 2, 4]), [[1, 2, 4, 1]]);
  // Without approved orders: up through what is playable and back to 1.
  assert.deepEqual(rhythm.switchOrders({ params: {} }, [1, 2]), [[1, 2, 1]]);
  assert.equal(rhythm.switchOrders({ params: {} }, [1]), null);
  for (let seed = 1; seed < 30; seed++) {
    const q = rhythm.switchQuestion(4, 70, [1, 2, 4], template, { step: 2, ask: 'tap' }, makeRng(seed));
    assert.ok(q && q.ask === 'tap');
    assert.ok(q.sections.every((s) => s.guna !== 8));
  }
  const name = rhythm.switchQuestion(4, 70, [1, 2], template, { step: 1, ask: 'name' }, makeRng(4));
  assert.equal(name.ask, 'name');
  assert.equal(name.answer, '2');
  assert.deepEqual(name.choices, ['1', '2']);
  assert.equal(rhythm.switchQuestion(4, 70, [1], template, { step: 1, ask: 'name' }, makeRng(4)), null);
});

test('switch loops stay inside the phone loop limit (160 s)', () => {
  const q = rhythm.switchQuestion(16, 40, [1, 2, 4], { params: { orders: [[1, 2, 4, 1]], cyclesPerSection: 2 } }, { step: 2 }, makeRng(1));
  // 4 sections × 2 cycles × 16 beats at 40 bpm = 192 s: one cycle each.
  assert.ok(q.sections.every((s) => s.cycles === 1));
});

// ---------------------------------------------------------------- Echo Challenge

test('echo call: the answer window is exactly as long as the call; only its taps count', () => {
  const call = echo.echoCall(['te', 're', 'khe', 'ta'], true, 0);
  assert.equal(call.length, 4);
  assert.equal(call.answerStart, 4);
  assert.equal(call.pattern.beats, 8);
  assert.equal(call.pattern.events.filter((e) => e.sound === 'click').length, 4);
  assert.ok(call.pattern.events.filter((e) => e.sound === 'click').every((e) => echo.inAnswer(call, e.at)));
  assert.deepEqual(call.answers.map((h) => h.at), [4, 5, 6, 7]);
  // Recall after a delay: one silent cycle, then the window.
  const later = echo.echoCall(['te', 're'], false, 1);
  assert.equal(later.answerStart, 4);
  assert.equal(later.pattern.events.filter((e) => e.at >= 2).length, 0);
});

test('echo pad answers: the order of hands, and taps outside the window do not count', () => {
  const call = echo.echoCall(['te', 're', 'khe', 'ta'], true, 0);
  const hands = call.answers.map((h) => h.hand);
  assert.deepEqual(hands, ['right', 'right', 'left', 'right']);
  const right = echo.gradeEcho(call, call.answers.map((h) => ({ hand: h.hand, at: h.at + 0.02 })), BPM);
  assert.equal(right.orderOk, true);
  assert.equal(right.given, 'R R L R');
  assert.deepEqual(right.errorsMs, [20, 20, 20, 20]);
  const swapped = echo.gradeEcho(call, [{ hand: 'right', at: 4 }, { hand: 'left', at: 5 }, { hand: 'right', at: 6 }, { hand: 'right', at: 7 }], BPM);
  assert.equal(swapped.orderOk, false);
  // A tap during the call is not part of the answer.
  const early = echo.gradeEcho(call, [{ hand: 'left', at: 1 }, ...call.answers.map((h) => ({ hand: h.hand, at: h.at }))], BPM);
  assert.equal(early.orderOk, true);
});

// ---------------------------------------------------------------- Tāla Cycle Master

test('tāla "restart": never starts at sam; the restart place is where the whole cycle begins', () => {
  const cycle = ['te', 're', 'khe', 'ta', 'ta', 'khe', 'te', 're'];
  for (let seed = 1; seed < 40; seed++) {
    const q = rhythm.talaQuestion(cycle, { step: 1, ask: 'restart', grid: true }, rhythm.challengeRng(seed, 0));
    assert.equal(q.ask, 'restart');
    assert.notEqual(q.heard[0], undefined);
    const from = 2 * cycle.length - q.heard.length; // played from beat `from` of the cycle
    assert.ok(from >= 1 && from <= cycle.length - 1, 'not at sam');
    assert.deepEqual(q.right, [cycle.length - from]);
    assert.ok(rhythm.isRestart(q, q.answer));
    assert.equal(q.heard.slice(Number(q.answer) - 1, Number(q.answer) - 1 + cycle.length).join(' '), cycle.join(' '));
  }
  // A cycle that repeats inside itself: every place where it starts whole is right.
  const q = rhythm.talaQuestion(['te', 're', 'te', 're'], { step: 1 }, rhythm.challengeRng(3, 0));
  assert.ok(q.right.length >= 2);
});

test('tāla "count": the answer is among the choices, all at least 1; "sam" runs whole loops', () => {
  for (let seed = 1; seed < 30; seed++) {
    const q = rhythm.talaQuestion(['te', 're', 'khe', 'ta'], { step: 3, ask: 'count', cycles: [2, 4] }, rhythm.challengeRng(seed, 1));
    assert.ok(q.choices.includes(q.answer));
    assert.ok(q.cycles >= 2 && q.cycles <= 4);
    assert.ok(q.choices.every((c) => Number(c) >= 1));
  }
  const sam = rhythm.talaQuestion(['te', 're', 'khe', 'ta'], { step: 4, ask: 'sam', mute: 2, cycles: 4 }, rhythm.challengeRng(1, 0));
  assert.equal(sam.cycles % 3, 0);
  // Sam pulses are one per cycle, counted from beat 0 (1 at sam: no off-by-one).
  assert.deepEqual(grading.pulsesOf(4, sam.cycles, true), [0, 4, 8, 12, 16, 20]);
});

test('the same seed and place ask the same question (replay, DYN-06)', () => {
  const step = { step: 1, ask: 'restart' };
  const a = rhythm.talaQuestion(['te', 're', 'khe', 'ta'], step, rhythm.challengeRng(42, 2));
  const b = rhythm.talaQuestion(['te', 're', 'khe', 'ta'], step, rhythm.challengeRng(42, 2));
  assert.deepEqual(a, b);
});

// ---------------------------------------------------------------- Daily Sādhana Quest

const OPTIONS = [
  { game: 'sound_detective', skill: 'listen.stroke', group: 'listening' },
  { game: 'missing_beat', skill: 'listen.phrase', group: 'listening' },
  { game: 'tempo_detective', skill: 'listen.tempo', group: 'listening' },
  { game: 'tap_the_beat', skill: 'rhythm.pulse', group: 'rhythm' },
  { game: 'echo', skill: 'rhythm.recall', group: 'rhythm' },
  { game: 'tala_cycle', skill: 'rhythm.cycle_sam', group: 'rhythm' },
].map((o) => ({ ...o, label: null, lastPractised: null, assigned: false }));

const days = ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02'];
const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const quest = (day, options = OPTIONS, count = 2, done = []) =>
  today.questLines({
    options,
    count,
    seeds: Array.from({ length: today.QUEST_DAYS }, (_, i) => roundSeed('student-1', 'daily_quest', addDays(day, i - today.QUEST_DAYS + 1), 0)),
    doneToday: done,
  });
test('quest: skills are ranked on earlier days\' rounds, so a game played today stays on the card, ticked', () => {
  const rounds = [{ startedAt: '2026-10-28T10:00:00Z' }, { startedAt: '2026-10-29T04:00:00Z' }, { startedAt: '2026-10-29T12:00:00Z' }];
  assert.deepEqual(today.questRankRounds(rounds, '2026-10-29'), [rounds[0]]);
});
test('quest: one listening and one rhythm line, about two minutes each', () => {
  for (const day of days) {
    const lines = quest(day);
    assert.equal(lines.length, 2);
    assert.deepEqual(lines.map((l) => l.group).sort(), ['listening', 'rhythm']);
    assert.ok(lines.every((l) => l.minutes === 2 && l.len >= 2 && l.len <= 3));
  }
});

test('quest: missions differ across 7 days and never repeat the day before\'s games', () => {
  const sets = days.map((d) => quest(d).map((l) => l.game).sort().join('+'));
  assert.ok(new Set(sets).size >= 3, `varied: ${sets.join(', ')}`);
  for (let i = 1; i < sets.length; i++) assert.notEqual(sets[i], sets[i - 1], `${days[i]} repeats ${days[i - 1]}`);
  for (const day of days) {
    const lines = quest(day);
    assert.equal(new Set(lines.map((l) => l.game)).size, lines.length);
  }
});
test('quest: the weakest skill first, assigned games before all, done lines ticked', () => {
  const weak = OPTIONS.map((o) => ({ ...o, label: o.game === 'echo' ? 'exploring' : 'steady', lastPractised: '2026-10-20T10:00:00Z' }));
  assert.equal(quest('2026-10-28', weak)[0].game, 'echo');
  const assigned = weak.map((o) => ({ ...o, assigned: o.game === 'tempo_detective' }));
  assert.equal(quest('2026-10-28', assigned)[0].game, 'tempo_detective');
  const ticked = quest('2026-10-28', assigned, 2, ['tempo_detective']);
  assert.equal(ticked.find((l) => l.game === 'tempo_detective')?.done, true);
  assert.equal(quest('2026-10-28', OPTIONS, 9).length, 4); // at most 4 lines
  assert.equal(quest('2026-10-28', OPTIONS.slice(0, 1)).length, 1); // only what exists
  assert.deepEqual(quest('2026-10-28', []), []);
});

// ---------------------------------------------------------------- the home and the words

test('the rhythm games are on the home now; Daily Quest is the card, not a tile', () => {
  const tiles = cat.allTiles();
  for (const game of ['tap_the_beat', 'echo', 'tala_cycle', 'rhythm_switching']) {
    assert.ok(tiles.find((t) => t.game === game)?.route, `${game} has an address`);
  }
  assert.equal(tiles.some((t) => t.game === 'daily_quest'), false);
  assert.equal(cat.gameForSkill('rhythm.guna')?.game, 'rhythm_switching');
  assert.equal(cat.gameForSkill('rhythm.cycle_sam')?.game, 'tala_cycle');
});

test('rhythm and quest strings exist in en, te and hi; feedback never says "wrong" or "Guru"', () => {
  const keysOf = (o, pre = '') => Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' ? keysOf(v, `${pre}${k}.`) : [`${pre}${k}`]));
  const en = locale('en');
  const enKeys = keysOf(en.playground.rhythm).sort();
  for (const lang of ['te', 'hi']) {
    const l = locale(lang);
    assert.deepEqual(keysOf(l.playground.rhythm).sort(), enKeys, `${lang} playground.rhythm`);
    for (const k of ['questTitle', 'questLine', 'questSaid', 'questDoneSaid', 'questDone', 'questListen', 'questRhythm']) assert.ok(l.todayPractice[k], `${lang} ${k}`);
  }
  const words = JSON.stringify(en.playground.rhythm) + JSON.stringify(en.todayPractice);
  assert.doesNotMatch(words, /\bwrong\b|\bfailed\b|off beat|\bguru\b/i);
});
