// Unit tests for the creative practice tools (docs/DECISIONS.md #470-#474): the tap pad's strokes and grading, the
// cycle stars and the phone's tuning; the "Which bol?" quiz's bols, phrases and questions; Echo me's call-and-answer
// loop; the recorded strokes' WAV reading; the bests kept on the phone and wiped at sign-out; the Learn more links'
// check. The database side (0055) is in supabase/tests/smoke-test.mjs. Run from app/: npm test.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import './stubs/register.mjs';

const { taalHits, TapScorer, BeatClock, cycleStars, calibrationOffset, correctedBeat, beatErrorMs, ON_TIME_MS, CLOSE_MS } = await import(
  '../src/lib/tap-grading.ts'
);
const { quizBols, quizPhrases, bolQuestion, phraseQuestion, phrasePattern, isRight, phraseText, soundKey, levelTaals } = await import(
  '../src/lib/ear-quiz.ts'
);
const { echoPlan, echoPlace, vibhagStarts } = await import('../src/lib/echo.ts');
const { parseWav, prepareStroke, resample } = await import('../src/lib/stroke-samples.ts');
const { wavFile } = await import('../src/lib/practice-sounds.ts');
const { readBol } = await import('../src/lib/bols.ts');
const { betterTap, saveTapBest, tapBest, saveQuizBest, quizBest, forgetPlayBests } = await import('../src/lib/play-bests.ts');
const { linkUrlOk, linkSite } = await import('../src/data/practice-links.ts');

const src = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const locale = (lang) => JSON.parse(src(`i18n/locales/${lang}.json`));

/** A fixed sequence of "random" numbers, round and round. */
const seq = (...values) => {
  let i = 0;
  return () => values[i++ % values.length];
};

// Kaharwa-like: dhā ge | nā ti | nā ka | dhi nā (8 beats, 2 vibhags of 4).
const KAHARWA = ['dhā', 'ge', 'nā', 'tin', 'nā', 'ka', 'dhin', 'nā'];

// ---------------------------------------------------------------- tap pad (#470)

test('tap pad: each stroke on its pad, dhā on both, in time order; rests and unknown bols give none', () => {
  const hits = taalHits(['dhā', '-', 'te.re', 'xyz']);
  assert.deepEqual(
    hits.map((h) => [h.at, h.hand, h.sound]),
    [[0, 'right', 'ta'], [0, 'left', 'ga'], [2, 'right', 'te'], [2.5, 'right', 'ra']],
  );
  // jhā: the dayan's tā comes a little after the baya's ga.
  const jha = taalHits(['jhā']);
  assert.equal(jha.find((h) => h.hand === 'left').at, 0);
  assert.ok(jha.find((h) => h.hand === 'right').at > 0);
});

test('tap pad: a tap is on time within 70 ms, early or late within 160 ms, else an extra tap', () => {
  assert.equal(ON_TIME_MS, 70);
  assert.equal(CLOSE_MS, 160);
  const hits = taalHits(['tā', 'tā', 'tā', 'tā']); // the right pad on every beat; 60 bpm = 1000 ms a beat
  const grade = (offsetMs) => new TapScorer(hits, 4).tap('right', 1 + offsetMs / 1000, 60);
  assert.equal(grade(0).grade, 'onTime');
  assert.equal(grade(-70).grade, 'onTime');
  assert.equal(grade(69).grade, 'onTime');
  assert.equal(grade(-120).grade, 'early');
  assert.equal(grade(150).grade, 'late');
  assert.equal(grade(150).errorMs, 150);
  assert.equal(grade(-200).grade, 'stray');
  assert.equal(grade(400).grade, 'stray');
  // The wrong pad matches nothing.
  assert.equal(new TapScorer(hits, 4).tap('left', 1, 60).grade, 'stray');
});

test('tap pad: a stroke is tapped once; the window shrinks when strokes are close (fast te re)', () => {
  const scorer = new TapScorer(taalHits(['tā', '-', '-', '-']), 4);
  assert.equal(scorer.tap('right', 0, 60).grade, 'onTime');
  assert.equal(scorer.tap('right', 0.01, 60).grade, 'stray'); // the same stroke again
  // te.re at 120 bpm: the strokes are 250 ms apart, so each takes taps up to 125 ms away only: 140 ms before the next
  // te is an extra tap; at 60 bpm (500 ms apart) the same tap is early.
  assert.equal(new TapScorer(taalHits(['te.re', '-']), 2).tap('right', 2 - 140 / 500, 120).grade, 'stray');
  assert.equal(new TapScorer(taalHits(['te.re', '-']), 2).tap('right', 2 - 140 / 1000, 60).grade, 'early');
  assert.equal(new TapScorer(taalHits(['te.re', '-']), 2).tap('right', 0.5 - 100 / 500, 120).grade, 'early'); // re, 100 ms early
});

test('tap pad: a tap early for the next cycle\'s sam counts for that cycle', () => {
  const scorer = new TapScorer(taalHits(['tā', '-', '-', '-']), 4);
  scorer.tap('right', 0, 60);
  const early = scorer.tap('right', 3.9, 60); // 100 ms before beat 1 of cycle 2
  assert.equal(early.grade, 'early');
  const [first, second] = scorer.close(8.5, 60);
  assert.equal(first.onTime, 1);
  assert.equal(second.close, 1);
});

test('tap pad: a cycle is scored once its last stroke\'s late window has passed; missed strokes count', () => {
  const scorer = new TapScorer(taalHits(['dhā', 'nā', '-', 'nā']), 4); // 4 strokes: tā+ga, nā, nā
  scorer.tap('right', 0, 60);
  scorer.tap('left', 0.02, 60);
  scorer.tap('right', 1.1, 60); // late
  scorer.tap('left', 2, 60); // extra
  assert.deepEqual(scorer.close(4.1, 60), []); // the next cycle's window is still open
  const [score] = scorer.close(4.2, 60);
  assert.deepEqual(
    { onTime: score.onTime, close: score.close, missed: score.missed, stray: score.stray, expected: score.expected },
    { onTime: 2, close: 1, missed: 1, stray: 1, expected: 4 },
  );
  assert.equal(score.stars, 1); // (2 + 1/2 - 1/4) / 4 = 56 %
});

test('tap pad: stars at 85 / 60 / 30 % with on time 1, close 1/2, an extra tap −1/4', () => {
  assert.equal(cycleStars(4, 4, 0, 0), 3);
  assert.equal(cycleStars(10, 8, 1, 0), 3); // 8.5 / 10
  assert.equal(cycleStars(10, 8, 0, 0), 2);
  assert.equal(cycleStars(10, 6, 0, 0), 2);
  assert.equal(cycleStars(10, 5, 0, 1), 1);
  assert.equal(cycleStars(10, 2, 2, 0), 1);
  assert.equal(cycleStars(10, 0, 0, 20), 0); // mashing the pads earns nothing
  assert.equal(cycleStars(0, 0, 0, 0), 0);
});

test('tap pad: only the answer\'s extra taps count in Echo me', () => {
  const scorer = new TapScorer(taalHits(['tā', '-']), 4, (b) => b >= 2);
  scorer.tap('left', 0.5, 60); // during the call: not held against the student
  scorer.tap('left', 2.5, 60); // during the answer
  const [score] = scorer.close(4.5, 60);
  assert.equal(score.stray, 1);
});

test('tap pad: the beat clock unrolls a phone\'s loop (cycle stays 0) and the browser\'s counted cycles alike', () => {
  const phone = new BeatClock(8);
  assert.deepEqual([phone.next({ beat: 6, cycle: 0 }), phone.next({ beat: 7.9, cycle: 0 }), phone.next({ beat: 0.2, cycle: 0 })], [6, 7.9, 8.2]);
  assert.equal(phone.next({ beat: 0.3, cycle: 0 }), 8.3);
  const web = new BeatClock(8);
  assert.deepEqual([web.next({ beat: 7.9, cycle: 0 }), web.next({ beat: 0.2, cycle: 1 })], [7.9, 8.2]);
});

test('tap pad: tuning takes the middle of the taps\' delays, leaves out the first two, refuses uneven taps', () => {
  assert.deepEqual(calibrationOffset([300, -200, 80, 90, 100, 85, 95, 110, 90, 88]), { offsetMs: 90, spreadMs: 7 });
  assert.equal(calibrationOffset([80, 90, 100]), null); // too few
  assert.equal(calibrationOffset([0, 0, 0, 300, 0, 300, 0, 300, 0, 300]), null); // all over the place
  // The delay is taken off each tap: 90 ms at 60 bpm = 0.09 beat.
  assert.ok(Math.abs(correctedBeat(4.09, 90, 60) - 4) < 1e-9);
  assert.ok(Math.abs(beatErrorMs(3.95, 80) - -37.5) < 1e-9);
});

// ---------------------------------------------------------------- Which bol? (#471)

const taal = (bols, levelId, active = true) => ({ bols, levelId, active });

test('which bol: a level\'s taals are its own, the levels before it and those for every level', () => {
  const taals = [taal(['tā'], 1), taal(['ka'], 2), taal(['gin'], 3), taal(['nā'], null), taal(['te'], 1, false)];
  assert.deepEqual(levelTaals(taals, 2).map((t) => t.bols[0]), ['tā', 'ka', 'nā']);
});

test('which bol: each sound once, as the taal writes it; first bols added up to three', () => {
  const pool = quizBols([taal(['dhā', 'ge', 'ka', 'ke', 'tin', 'tī', '-', 'xyz'], 1)], 1);
  // ke = ka and tī = tin sound the same: one card each, in the taal's spelling; xyz is unknown; '-' a rest.
  assert.deepEqual(pool.map((b) => b.text), ['dhā', 'ge', 'ka', 'tin']);
  const few = quizBols([taal(['tā', 'tā'], 1)], 1);
  assert.deepEqual(few.map((b) => b.text), ['tā', 'nā', 'tī']);
  assert.equal(quizBols([], 1).length, 3);
  assert.notEqual(soundKey(readBol('jhā')), soundKey(readBol('dhā')));
});

test('which bol: a question has the answer and two other bols, all different, and not the one just asked', () => {
  const pool = quizBols([taal(KAHARWA, 1)], 1);
  for (let i = 0; i < 30; i++) {
    const q = bolQuestion(pool, Math.random, pool[0].key);
    assert.equal(q.cards.length, 3);
    assert.equal(new Set(q.cards.map((c) => c.key)).size, 3);
    assert.ok(q.cards.some((c) => c.key === q.answer.key));
    assert.notEqual(q.answer.key, pool[0].key);
    assert.ok(isRight(q, q.cards.find((c) => c.key === q.answer.key)));
    assert.ok(!isRight(q, q.cards.find((c) => c.key !== q.answer.key)));
  }
  assert.equal(bolQuestion(pool.slice(0, 2), Math.random), null);
});

test('which bol: phrases follow the taal round the cycle, rests left out; other cards differ in one bol', () => {
  const phrases = quizPhrases([taal(['dhā', '-', 'nā', 'tin'], 1)], 1, 2);
  assert.deepEqual(phrases.map(phraseText), ['dhā nā', 'nā tin', 'tin dhā']);
  const pool = quizBols([taal(KAHARWA, 1)], 1);
  const many = quizPhrases([taal(KAHARWA, 1)], 1, 3);
  for (let i = 0; i < 30; i++) {
    const q = phraseQuestion(many, pool, 3, Math.random);
    assert.equal(new Set(q.cards.map((c) => c.key)).size, 3);
    for (const card of q.cards) {
      const differences = card.bols.filter((b, k) => b.key !== q.answer.bols[k].key).length;
      assert.ok(card.key === q.answer.key ? differences === 0 : differences === 1);
    }
  }
  // No taal long enough: the phrase is made from the bols.
  const made = phraseQuestion([], pool, 4, seq(0.1, 0.5, 0.9, 0.3, 0.7));
  assert.equal(made.answer.bols.length, 4);
});

test('which bol: a phrase plays one bol a beat, both hands of dhā together', () => {
  const pool = quizBols([taal(['dhā', 'nā'], 1)], 1);
  const pattern = phrasePattern({ bols: pool.slice(0, 2), key: 'x' });
  assert.equal(pattern.beats, 2);
  assert.deepEqual(pattern.events.map((e) => [e.at, e.sound]), [[0, 'ta'], [0, 'ga'], [1, 'na']]);
});

// ---------------------------------------------------------------- Echo me (#472)

test('echo me: vibhags from the divisions, or the whole taal when they do not add up', () => {
  assert.deepEqual(vibhagStarts(8, [4, 4]), [{ start: 0, length: 4 }, { start: 4, length: 4 }]);
  assert.deepEqual(vibhagStarts(8, [3, 4]), [{ start: 0, length: 8 }]);
  assert.deepEqual(vibhagStarts(8, []), [{ start: 0, length: 8 }]);
});

test('echo me: each vibhag is called, then as long silent for the answer, with clicks on its beats', () => {
  const plan = echoPlan(KAHARWA, [4, 4], null, true);
  assert.equal(plan.pattern.beats, 16);
  assert.deepEqual(plan.segments.map((s) => [s.vibhag, s.start, s.length, s.taalStart]), [[0, 0, 4, 0], [1, 8, 4, 4]]);
  const at = (from, to) => plan.pattern.events.filter((e) => e.at >= from && e.at < to);
  // The first call: dhā (2 strokes), ge, nā, tin.
  assert.deepEqual(at(0, 4).map((e) => e.sound), ['ta', 'ga', 'ga', 'na', 'ti']);
  // Its answer: four clicks and nothing else.
  assert.deepEqual(at(4, 8).map((e) => [e.at, e.sound]), [[4, 'click'], [5, 'click'], [6, 'click'], [7, 'click']]);
  // The second call starts at 8 with the taal's beat 4 (nā).
  assert.deepEqual(at(8, 9).map((e) => [e.beat, e.sound]), [[4, 'na']]);
  // The answers expected: the calls' strokes moved by one vibhag.
  assert.deepEqual(plan.answers.filter((h) => h.at < 8).map((h) => h.at), [4, 4, 5, 6, 7]);
  assert.equal(plan.answers.length, taalHits(KAHARWA).length);
});

test('echo me: one vibhag again and again; quiet answers without clicks', () => {
  const plan = echoPlan(KAHARWA, [4, 4], 1, false);
  assert.equal(plan.pattern.beats, 8);
  assert.ok(plan.pattern.events.every((e) => e.at < 4));
  assert.deepEqual(plan.pattern.events.map((e) => e.beat), [4, 5, 6, 6, 7]);
  assert.equal(echoPlan(KAHARWA, [4, 4], 5, true), null);
  assert.equal(echoPlan([], [], null, true), null);
  assert.notEqual(echoPlan(KAHARWA, [4, 4], 1, false).pattern.key, echoPlan(KAHARWA, [4, 4], 1, true).pattern.key);
});

test('echo me: where the loop is, call or answer', () => {
  const { segments } = echoPlan(KAHARWA, [4, 4], null, true);
  assert.deepEqual(echoPlace(segments, 1), { segment: segments[0], phase: 'call', beat: 1 });
  assert.deepEqual(echoPlace(segments, 5.5), { segment: segments[0], phase: 'answer', beat: 1 });
  assert.deepEqual(echoPlace(segments, 9), { segment: segments[1], phase: 'call', beat: 1 });
  assert.equal(echoPlace(segments, 16), null);
});

// ---------------------------------------------------------------- real khol sounds, prepared (#473)

test('recorded strokes: a 16-bit WAV is read back; the quiet before the stroke is cut, peak 0.9, faded out', () => {
  const rate = 8000;
  const samples = new Float32Array(rate); // 1 s: 0.1 s of silence, then a decaying stroke
  for (let i = 800; i < rate; i++) samples[i] = 0.5 * Math.exp(-(i - 800) / 1000) * Math.sin(i / 3);
  const wav = parseWav(wavFile(samples, rate));
  assert.equal(wav.rate, rate);
  assert.equal(wav.samples.length, rate);
  assert.ok(Math.abs(wav.samples[1000] - samples[1000]) < 1e-4);
  const stroke = prepareStroke(wav.samples, rate);
  assert.ok(stroke.length <= rate - 800 + 16 + 1 && stroke.length > rate - 900);
  const peak = Math.max(...stroke.map(Math.abs));
  assert.ok(Math.abs(peak - 0.9) < 1e-3);
  assert.ok(Math.abs(stroke[stroke.length - 1]) < 1e-3);
  assert.equal(resample(stroke, rate, 2 * rate).length, 2 * stroke.length);
  assert.equal(parseWav(new Uint8Array(10)), null);
  assert.equal(parseWav(new TextEncoder().encode('RIFF....WAVEjunk'.padEnd(60, ' '))), null);
});

test('recorded strokes: stereo is mixed down; 24-bit read; none ship yet, and the setting says so', () => {
  // A stereo 16-bit WAV of two frames: (0.5, -0.5) and (0.25, 0.25).
  const bytes = new Uint8Array(44 + 8);
  const view = new DataView(bytes.buffer);
  const put = (at, text) => [...text].forEach((ch, i) => (bytes[at + i] = ch.charCodeAt(0)));
  put(0, 'RIFF'); view.setUint32(4, 44, true); put(8, 'WAVE'); put(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 2, true); view.setUint32(24, 44100, true);
  view.setUint16(34, 16, true); put(36, 'data'); view.setUint32(40, 8, true);
  [16384, -16384, 8192, 8192].forEach((v, i) => view.setInt16(44 + 2 * i, v, true));
  assert.deepEqual([...parseWav(bytes).samples], [0, 0.25]);
  // The same header as mono 24-bit with one sample of −0.5 (0xC00000).
  view.setUint16(22, 1, true); view.setUint16(34, 24, true); view.setUint32(40, 3, true);
  bytes.set([0x00, 0x00, 0xc0], 44);
  assert.deepEqual([...parseWav(bytes.slice(0, 47)).samples], [-0.5]);
  const samples = src('lib/khol-samples.ts');
  assert.match(samples, /export const KHOL_SAMPLE_FILES: Partial<Record<SoundId, number>> = \{\};/);
  assert.match(src('components/play-and-learn.tsx'), /realSoundsReady\(\)/);
  assert.match(src('lib/practice-sounds.ts'), /const real = recorded\?\.\(id, rate\);/);
  // Every stroke of bols.ts is on the Guru's list (docs/KHOL_RECORDINGS.md).
  const doc = readFileSync(new URL('../../docs/KHOL_RECORDINGS.md', import.meta.url), 'utf8');
  for (const id of ['ta', 'na', 'ti', 'ra', 'te', 'ka', 'gha', 'ga', 'gin']) assert.match(doc, new RegExp(`\\b${id}\\.wav\\b`));
});

// ---------------------------------------------------------------- bests on the phone, links

test('bests: kept per person on this phone; more stars, or as many faster; wiped at sign-out', () => {
  forgetPlayBests();
  assert.equal(betterTap({ stars: 0, bpm: 90 }, null), false);
  assert.equal(betterTap({ stars: 2, bpm: 60 }, { stars: 1, bpm: 90 }), true);
  assert.equal(betterTap({ stars: 2, bpm: 70 }, { stars: 2, bpm: 60 }), true);
  assert.equal(betterTap({ stars: 2, bpm: 60 }, { stars: 2, bpm: 60 }), false);
  assert.equal(saveTapBest('p1', 'pad:1', { stars: 2, bpm: 60 }), true);
  assert.equal(saveTapBest('p1', 'pad:1', { stars: 1, bpm: 90 }), false);
  assert.deepEqual(tapBest('p1', 'pad:1'), { stars: 2, bpm: 60 });
  assert.equal(tapBest('p2', 'pad:1'), null); // another person on the same phone sees none
  assert.equal(saveQuizBest('p1', '1:1', 4), true);
  assert.equal(saveQuizBest('p1', '1:1', 3), false);
  assert.equal(quizBest('p1', '1:1'), 4);
  forgetPlayBests();
  assert.equal(tapBest('p1', 'pad:1'), null);
  assert.match(src('lib/device-traces.ts'), /forgetPlayBests\(\);/);
});

test('learn more: an https link to a site, as the database checks; the site shown without www', () => {
  for (const ok of ['https://www.kksongs.org/khol', 'https://example.org', 'https://a.b.co/x?y=1#z', 'https://example.org:8443/p']) {
    assert.equal(linkUrlOk(ok), true, ok);
  }
  for (const bad of ['http://example.org', 'https://localhost/x', 'https://example.org/a b', 'javascript:alert(1)', '', `https://example.org/${'x'.repeat(490)}`]) {
    assert.equal(linkUrlOk(bad), false, bad);
  }
  assert.equal(linkSite('https://www.KKSongs.org/khol/'), 'kksongs.org');
  // The same rule as 0055's guard.
  const sql = readFileSync(new URL('../../supabase/migrations/0055_practice_links.sql', import.meta.url), 'utf8');
  assert.ok(sql.includes(`'^https://[a-z0-9-]+(\\.[a-z0-9-]+)*\\.[a-z]{2,}(:[0-9]{1,5})?([/?#][^\\s]*)?$'`));
  assert.ok(src('data/practice-links.ts').includes('/^https:\\/\\/[a-z0-9-]+(\\.[a-z0-9-]+)*\\.[a-z]{2,}(:[0-9]{1,5})?([/?#][^\\s]*)?$/i'));
});

test('the creative tools are on Practice tools, with their routes for students and staff, in three languages', () => {
  assert.match(src('screens/practice-tools.tsx'), /<PlayAndLearn area=\{area\} \/>/);
  for (const route of ['tap-pad', 'which-bol', 'echo-me', 'learn-more']) {
    for (const area of ['student', 'staff']) assert.ok(src(`app/${area}/${route}.tsx`).includes('@/screens/'), `${area}/${route}`);
  }
  for (const lang of ['en', 'te', 'hi']) {
    const l = locale(lang);
    for (const section of ['play', 'tapPad', 'whichBol', 'echo', 'learnMore']) assert.ok(l[section]?.title, `${lang} ${section}`);
    assert.ok(l.recordMyself.echoAt);
  }
  // Nothing about a child's play leaves the phone: no data module is called from the game screens.
  for (const screen of ['tap-pad', 'which-bol', 'echo-me']) assert.doesNotMatch(src(`screens/${screen}.tsx`), /supabase|logPractice|\.rpc\(/);
});
