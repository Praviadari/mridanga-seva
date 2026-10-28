// Unit tests for the Rhythm Playground's student home and listening games (docs/DECISIONS.md #730-#739;
// docs/RHYTHM_PLAYGROUND.md §6.1, §7.1, §7.4, §7.6, §7.8, §12.4): each game's rounds as the engine (lib/playground,
// package W1) builds them from a small approved pack and as the screens play them (lib/playground-games/listening.ts:
// a card's sound = its label, gaps silent, tiles placed and checked by sound, A and B on one clock); the feedback after
// each pick; the saved items and the summary; the progress labels; the home's tiles and the Practice tab's one card.
// Run from app/: npm test.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import './stubs/register.mjs';

const { generateRound } = await import('../src/lib/playground/generator.ts');
const { bolIndex, keyBeats, REST } = await import('../src/lib/playground/notation.ts');
const round = await import('../src/lib/playground-games/round.ts');
const play = await import('../src/lib/playground-games/listening.ts');
const cat = await import('../src/lib/playground-games/catalogue.ts');
const { readBol } = await import('../src/lib/bols.ts');
const { soundKey } = await import('../src/lib/ear-quiz.ts');

const src = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const locale = (lang) => JSON.parse(src(`i18n/locales/${lang}.json`));
const en = locale('en');

// ---------------------------------------------------------------- a small approved pack (as the TEST seed)

const bol = (id, written, head, closePairs = [], soundsLike = []) => ({
  id, written, head, technique: null, open: null, levelId: 1, soundsLike, closePairs, assetId: null, placeholder: false,
});
const BOLS = [
  bol('ta', 'tā', 'dayan', ['na']),
  bol('na', 'nā', 'dayan', ['ta']),
  bol('ti', 'tī', 'dayan', ['te']),
  bol('te', 'te', 'dayan', ['ti']),
  bol('re', 're', 'dayan'),
  bol('ka', 'ka', 'baya', [], ['ke']),
  bol('ke', 'ke', 'baya', [], ['ka']),
  bol('ga', 'ga', 'baya', ['gha']),
  bol('gha', 'gha', 'baya', ['ga']),
  bol('dha', 'dhā', 'both', ['dhin']),
  bol('dhin', 'dhin', 'both', ['dha']),
];
const tpl = (id, game, skill, steps, roundLen = 6) => ({
  id, game, skill, responseMode: game === 'rhythm_builder' ? 'order' : 'choose', levelMin: 1, levelMax: 3, steps, params: { roundLen }, revision: 1,
});
const TEMPLATES = [
  tpl(1, 'sound_detective', 'listen.stroke', [
    { step: 1, choices: 2, len: [1, 1], otherHead: true },
    { step: 2, choices: 3, len: [1, 1] },
    { step: 3, choices: 4, len: [1, 1] },
    { step: 4, choices: 3, len: [1, 1], closePairs: true },
  ]),
  tpl(2, 'missing_beat', 'listen.phrase', [
    { step: 1, choices: 3, gaps: 1, grid: true },
    { step: 2, choices: 4, gaps: 1, grid: true },
    { step: 3, choices: 4, gaps: 1, grid: false },
    { step: 4, choices: 4, gaps: 2, grid: true },
  ]),
  tpl(3, 'rhythm_builder', 'rhythm.sequence', [
    { step: 1, extraTiles: 0, grid: true },
    { step: 2, extraTiles: 1, grid: true },
    { step: 3, extraTiles: 2, grid: false },
  ], 5),
  tpl(4, 'tempo_detective', 'listen.tempo', [{ step: 1, tempoDiff: 0.25 }, { step: 2, tempoDiff: 0.15 }, { step: 3, tempoDiff: 0.08 }]),
];
let nextId = 1;
const ex = (game, templateId, sequence, extra = {}) => ({
  id: nextId++, game, templateId, levelId: 1, skills: [], taalId: null, sequence, divisions: null, answer: {}, distractors: [],
  promptAssets: [], bpmMin: 60, bpmMax: 80, guna: [1], requiresItem: null, locale: 'en', attribution: null, placeholder: false, revision: 1,
  ...extra,
});
const EXERCISES = [
  ...['ta', 'na', 'ti', 'te', 'ka', 'ga', 'gha', 'dha', 'dhin'].map((b) => ex('sound_detective', 1, [b])),
  ex('missing_beat', 2, ['ta', 'na', 'ta', 'na'], { divisions: [2, 2] }),
  ex('missing_beat', 2, ['te', 're', 'ka', 'ta']),
  ex('missing_beat', 2, ['dha', 'ga', 'na', 'ti']),
  ex('missing_beat', 2, ['ta', '-', 'ka', 'ta', 'gha', 'gha', '-', 'ta'], { divisions: [4, 4] }),
  ex('rhythm_builder', 3, ['dha', 'ti', 'ta']),
  ex('rhythm_builder', 3, ['ta', '-', 'te.re', 'ka', 'ta'], { divisions: [2, 3] }),
  ex('rhythm_builder', 3, ['ga', 'gha', 'na', 'ka']),
  ex('tempo_detective', 4, ['dha', 'ti', 'ta', 'ka']),
  ex('tempo_detective', 4, ['ta', 'na', 'ta', 'na'], { bpmMin: 70, bpmMax: 100 }),
];
const LABELS = {
  practisingItems: 10, steadyShare: 0.8, steadyItems: 20, steadyDays: 2, steadyMaxReplays: 1, timingRounds: 3, timingMedianMs: 60,
  timingSpreadMs: 50, timingDays: 2, windowDays: 30,
};
const PACK = { version: 3, publishedAt: '2026-10-28T00:00:00Z', placeholders: false, bols: BOLS, assets: [], templates: TEMPLATES, exercises: EXERCISES, labels: LABELS };
const INDEX = bolIndex(BOLS);
const NOW = Date.parse('2026-10-28T10:00:00Z');

const make = (game, step, seed) =>
  generateRound({ pack: PACK, levelId: 1, levelUpOk: false, ticked: [], game, step, seed, mode: 'play', seen: [], now: NOW });

// ---------------------------------------------------------------- Sound Detective (#731)

test('Sound Detective: 200 seeded rounds — the answer among the cards, no card sounding like it, the step’s card count, no back-to-back', () => {
  const choices = { 1: 2, 2: 3, 3: 4, 4: 3 };
  for (let seed = 1; seed <= 200; seed++) {
    const step = (seed % 4) + 1;
    const r = make('sound_detective', step, seed);
    assert.ok(r.challenges.length >= 4, `seed ${seed}`);
    for (const c of r.challenges) {
      assert.equal(c.choices.length, choices[step]);
      assert.equal(c.choices.filter((ch) => ch.key === c.answer).length, 1);
      const sounds = c.choices.map((ch) => play.choiceText(ch, INDEX));
      assert.equal(new Set(sounds).size, sounds.length);
      for (const ch of c.choices) for (const b of keyBeats(ch.key)) assert.ok(INDEX.has(b), b);
    }
    for (let i = 1; i < r.challenges.length; i++) assert.notEqual(r.challenges[i].exerciseId, r.challenges[i - 1].exerciseId);
  }
});

test('Sound Detective: a card plays what it shows (parity), written as the class writes it, with its hand', () => {
  const r = make('sound_detective', 3, 11);
  for (const c of r.challenges) {
    for (const ch of c.choices) {
      const written = play.choiceText(ch, INDEX);
      assert.equal(written, INDEX.get(ch.key).written);
      const sounds = play.choicePattern(ch).events.map((e) => e.sound).sort();
      const expected = readBol(written).strokes.map((s) => s.sound).sort();
      assert.deepEqual(sounds, expected, written);
      assert.equal(soundKey(readBol(ch.key)), soundKey(readBol(written)));
    }
    // The prompt is the answer's beats.
    assert.deepEqual(c.prompt.beats, keyBeats(c.answer));
  }
  assert.equal(play.choiceHands({ key: 'ta', beats: ['ta'] }, INDEX), 'right');
  assert.equal(play.choiceHands({ key: 'ga', beats: ['ga'] }, INDEX), 'left');
  assert.equal(play.choiceHands({ key: 'dha', beats: ['dha'] }, INDEX), 'both');
  assert.equal(play.choiceHands({ key: 'ta na', beats: ['ta', 'na'] }, INDEX), null);
});

test('Sound Detective: same seed and content → the same round (the recipe replays); another seed → another round', () => {
  assert.deepEqual(make('sound_detective', 2, 77), make('sound_detective', 2, 77));
  const ids = (r) => r.challenges.map((c) => `${c.exerciseId}:${c.choices.map((ch) => ch.key).join(',')}`).join('|');
  const differ = new Set([1, 2, 3, 4, 5].map((s) => ids(make('sound_detective', 2, s))));
  assert.ok(differ.size >= 3);
});

test('Sound Detective: step 1 = cards on different heads; step 4 = the answer’s close pair among the cards', () => {
  for (let seed = 1; seed <= 100; seed++) {
    for (const c of make('sound_detective', 1, seed).challenges) {
      const heads = c.choices.map((ch) => INDEX.get(ch.key).head);
      if (heads.includes('both')) continue;
      assert.notEqual(heads[0], heads[1]);
    }
    for (const c of make('sound_detective', 4, seed).challenges) {
      const pairs = INDEX.get(c.answer).closePairs;
      if (pairs.length > 0) assert.ok(c.choices.some((ch) => pairs.includes(ch.key)), c.answer);
    }
  }
});

// ---------------------------------------------------------------- Missing Beat (#732)

test('Missing Beat: the gap is silent and never on a rest; the whole pattern is the approved one; one pick per gap', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const step = (seed % 4) + 1;
    for (const c of make('missing_beat', step, seed).challenges) {
      const exercise = EXERCISES.find((e) => e.id === c.exerciseId);
      assert.deepEqual(c.prompt.beats, exercise.sequence);
      assert.equal(c.prompt.gaps.length, step === 4 ? 2 : 1);
      for (const g of c.prompt.gaps) assert.notEqual(c.prompt.beats[g], REST);
      const heard = play.heardBeats(c.prompt);
      c.prompt.beats.forEach((beat, i) => assert.equal(heard[i], c.prompt.gaps.includes(i) ? REST : beat));
      assert.equal(c.prompt.grid, step !== 3);
      // Picking each gap's own beat, in order, is the answer.
      const picks = c.prompt.gaps.map((g) => c.prompt.beats[g]);
      assert.equal(play.gapsGiven(picks), c.answer);
      for (const p of picks) assert.ok(c.choices.some((ch) => ch.key === p));
    }
  }
});

test('Missing Beat: the grid shows "?" for an open gap, the pick once made, every beat after the answer', () => {
  const prompt = { beats: ['ta', '-', 'te.re', 'ka'], gaps: [0, 3] };
  assert.deepEqual(play.gridCells(prompt, [], INDEX, false), ['?', '–', 'te·re', '?']);
  assert.deepEqual(play.gridCells(prompt, ['na'], INDEX, false), ['nā', '–', 'te·re', '?']);
  assert.deepEqual(play.gridCells(prompt, ['na'], INDEX, true), ['tā', '–', 'te·re', 'ka']);
});

// ---------------------------------------------------------------- Rhythm Builder (#733)

test('Rhythm Builder: a tile a beat plus the step’s extra tiles; rests already placed; tap-to-place; checked by sound', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const step = (seed % 3) + 1;
    for (const c of make('rhythm_builder', step, seed).challenges) {
      const beats = c.prompt.beats;
      const toPlace = beats.filter((b) => b !== REST).length;
      assert.equal(c.choices.length, toPlace + [0, 0, 1, 2][step]);
      let placed = play.emptyPlaces(beats);
      assert.equal(play.allPlaced(beats, placed), false);
      placed = play.rightPlaces(beats, c.choices, INDEX);
      assert.equal(play.allPlaced(beats, placed), true);
      assert.deepEqual(play.placedBeats(beats, c.choices, placed), beats);
      assert.deepEqual(play.placesToHearAgain(beats, c.choices, placed, INDEX), []);
    }
  }
});

test('Rhythm Builder: placing moves a tile, a rest takes nothing, a wrong place is named, ke for ka counts as right', () => {
  const beats = ['ta', '-', 'te.re', 'ka'];
  const choices = [{ key: 'ka', beats: ['ka'] }, { key: 'ta', beats: ['ta'] }, { key: 'te.re', beats: ['te.re'] }];
  let placed = play.emptyPlaces(beats);
  placed = play.placeTile(beats, placed, 1, 0);
  placed = play.placeTile(beats, placed, 2, 2);
  placed = play.placeTile(beats, placed, 0, 3);
  assert.deepEqual(placed, [1, null, 2, 0]);
  assert.deepEqual(play.placeTile(beats, placed, 0, 1), placed, 'a rest takes nothing');
  const moved = play.placeTile(beats, placed, 1, 3);
  assert.deepEqual(moved, [null, null, 2, 1]);
  assert.deepEqual(play.placesToHearAgain(beats, choices, moved, INDEX), [0, 3]);
  assert.deepEqual(play.placedBeats(beats, choices, moved), ['-', '-', 'te.re', 'ta']);
  assert.deepEqual(play.takeTile(placed, 0), [null, null, 2, 0]);
  const withKe = [{ key: 'ke', beats: ['ke'] }, ...choices.slice(1)];
  assert.deepEqual(play.placesToHearAgain(beats, withKe, placed, INDEX), []);
  // The same bol twice is two tiles: the right order uses each once.
  assert.deepEqual(play.rightPlaces(['ta', 'ta'], [{ key: 'ta', beats: ['ta'] }, { key: 'ta', beats: ['ta'] }], INDEX), [0, 1]);
});

// ---------------------------------------------------------------- Tempo Detective (#734)

test('Tempo Detective: both tempos inside the approved range, the answer from the two tempos, all three answers occur', () => {
  const seen = new Set();
  for (let seed = 1; seed <= 300; seed++) {
    for (const c of make('tempo_detective', (seed % 3) + 1, seed).challenges) {
      const e = EXERCISES.find((x) => x.id === c.exerciseId);
      const a = c.prompt.bpm;
      const b = c.prompt.second.bpm;
      for (const bpm of [a, b]) assert.ok(bpm >= e.bpmMin && bpm <= e.bpmMax, `${bpm} in ${e.bpmMin}-${e.bpmMax}`);
      assert.equal(c.answer, b > a ? 'faster' : b < a ? 'slower' : 'same');
      seen.add(c.answer);
    }
  }
  assert.deepEqual([...seen].sort(), ['faster', 'same', 'slower']);
});

test('Tempo Detective: A and B on one clock — same strokes, B spaced by its tempo; the beat dots for the picture', () => {
  const beats = ['ta', 'na', 'ta', 'na'];
  const { pattern, bpm } = play.bothPattern(beats, 60, 75);
  assert.equal(bpm, 60);
  const one = play.beatsPattern(beats);
  assert.equal(pattern.events.length, one.events.length * 2);
  const b = pattern.events.slice(one.events.length);
  assert.deepEqual(b.map((e) => e.sound), one.events.map((e) => e.sound));
  assert.equal(b[0].at, one.beats + play.TEMPO_GAP_BEATS);
  assert.ok(Math.abs(b[1].at - b[0].at - 60 / 75) < 1e-9);
  const same = play.bothPattern(beats, 70, 70).pattern.events;
  assert.ok(Math.abs(same[same.length - 1].at - same[same.length - 2].at - 1) < 1e-9);
  const times = play.beatTimes(4, 60, 75);
  assert.deepEqual(times.a, [0, 1, 2, 3]);
  [0, 0.8, 1.6, 2.4].forEach((s, i) => assert.ok(Math.abs(times.b[i] - s) < 1e-9));
});

// ---------------------------------------------------------------- feedback, saved items, summary (#736)

test('feedback: right, then "listen again" once, then the answer is shown; words with an icon, never wrong or failed', () => {
  assert.equal(round.TRIES, 2);
  assert.equal(round.pickOutcome(1, true), 'right');
  assert.equal(round.pickOutcome(1, false), 'again');
  assert.equal(round.pickOutcome(2, false), 'shown');
  assert.equal(round.pickOutcome(2, true), 'right');
  assert.equal(en.playground.feedback.right, 'That’s it!');
  assert.equal(en.playground.feedback.again, 'Not yet — listen again.');
  for (const outcome of ['right', 'again', 'shown']) {
    const text = round.feedbackKey(outcome).split('.').slice(1).reduce((o, k) => o[k], en.playground);
    assert.ok(text && round.feedbackIcon(outcome), outcome);
  }
  for (const lang of ['en', 'te', 'hi']) assert.ok(locale(lang).playground.feedback.shown.includes('{{answer}}'), lang);
  // No Playground string says wrong, failed, lost, streak, rank or points.
  assert.doesNotMatch(JSON.stringify(en.playground), /\bwrong\b|\bfail(ed)?\b|\blost\b|\bstreak|\brank|\bpoints?\b|off beat/i);
});

test('saved item: short keys for record_round with the first answer, first-try right, tries, replays and the review mark', () => {
  const c = make('sound_detective', 2, 5).challenges[0];
  const item = round.savedItem({ ...c, review: true }, { given: 'na', ok: false, tries: 2, replays: 3, ms: 2300.4 });
  assert.deepEqual(item, { e: c.exerciseId, r: c.revision, q: c.query, a: 'na', ok: false, rp: 3, ms: 2300, rv: true, tr: 2 });
});

test('summary: first-try rights counted, reviews counted, a close pair named once either way round', () => {
  const it = (ok, rv = false) => ({ e: 1, r: 1, ok, rv });
  const s = round.summarise([it(true), it(false), it(false), it(true, true), it(false)], [['tā', 'nā'], ['nā', 'tā'], ['ga', 'ka'], ['ka', 'ka']]);
  assert.deepEqual(s, { correct: 2, total: 5, review: 1, close: [['tā', 'nā'], ['ga', 'ka']] });
});

test('played round: the recipe, the items and the device, unfinished when left mid-round', () => {
  const r = make('missing_beat', 1, 9);
  const items = [round.savedItem(r.challenges[0], { given: 'ta', ok: true, tries: 1, replays: 0, ms: 900 })];
  const started = new Date('2026-10-28T10:00:00Z');
  const p = round.playedRound({ id: 'abc', round: r, startedAt: started, finishedAt: null, items, device: 'web' });
  assert.deepEqual(
    { ...p, items: p.items.length },
    { id: 'abc', game: 'missing_beat', skill: 'listen.phrase', mode: 'play', levelId: 1, step: 1, seed: 9, contentVersion: 3, startedAt: started.toISOString(), finishedAt: null, items: 1, timing: null, device: 'web' },
  );
});

// ---------------------------------------------------------------- home, Practice tab, progress labels (#730, #735)

test('home: 13 games in four groups (the Daily Quest is the Daily Mission card); only built games have an address, each once', () => {
  const tiles = cat.allTiles();
  assert.equal(tiles.length, 13);
  assert.deepEqual(cat.PLAYGROUND_GROUPS.map((g) => g.group), ['listening', 'rhythm', 'voice', 'kirtan']);
  const built = tiles.filter((t) => t.route).map((t) => t.game).sort();
  assert.deepEqual(built, ['echo', 'missing_beat', 'rhythm_builder', 'sound_detective', 'tap_the_beat', 'tempo_detective']);
  const routes = tiles.filter((t) => t.route).map((t) => t.route);
  assert.equal(new Set(routes).size, routes.length);
  // Old addresses kept: Sound Detective is "Which bol?"'s, Tap the Beat the tap pad's, Echo Challenge Echo me's.
  assert.equal(tiles.find((t) => t.game === 'sound_detective').route, '/student/which-bol');
  assert.equal(tiles.find((t) => t.game === 'tap_the_beat').route, '/student/tap-pad');
  assert.equal(tiles.find((t) => t.game === 'echo').route, '/student/echo-me');
  for (const t of tiles.filter((x) => x.route)) {
    const file = `app${t.route}.tsx`;
    assert.ok(src(file).includes('@/screens/'), file);
  }
  for (const lang of ['en', 'te', 'hi']) for (const t of tiles) assert.ok(locale(lang).playground.game[t.game]?.name, `${lang} ${t.game}`);
  // Game content is English: the game names are the same in every language.
  for (const t of tiles) assert.equal(locale('te').playground.game[t.game].name, en.playground.game[t.game].name);
  const home = src('screens/playground/home.tsx');
  assert.match(home, /comingSoonSaid/);
  assert.match(home, /<TestSoundsBadge/);
  assert.match(src('app/student/playground/index.tsx'), /<PlaygroundHome \/>/);
});

test('Practice tab: one large Rhythm Playground card in place of the game tiles; the Daily Mission card stays first', () => {
  const tab = src('app/student/(tabs)/my-practice.tsx');
  assert.match(tab, /router\.push\('\/student\/playground'\)/);
  assert.match(tab, /<ShortcutTiles wide shortcuts=\{playground\} \/>/);
  assert.doesNotMatch(tab, /practiceTab\.games|\/student\/tap-pad|\/student\/which-bol|\/student\/echo-me/);
  assert.ok(tab.indexOf('<TodayPracticeCard') < tab.indexOf('<ShortcutTiles'));
  assert.equal(src('app/student/which-bol.tsx').includes('<SoundDetective />'), true);
  // Free play is the old quiz, which keeps nothing; the staff route keeps the quiz.
  assert.match(src('screens/playground/sound-detective.tsx'), /<WhichBolQuiz \/>/);
  assert.match(src('app/staff/which-bol.tsx'), /<WhichBol \/>/);
});

test('progress: label words with an icon, recognition and performance apart, unknown skills left out, the khol line', () => {
  assert.deepEqual(cat.labelView('steady'), { key: 'playground.label.steady', icon: 'tick' });
  assert.equal(cat.skillKey('listen.stroke'), 'playground.skill.listen_stroke');
  assert.equal(cat.skillKey('made.up'), null);
  const row = (skill, kind, label) => ({ skill, kind, label, opportunities: 5, correct: 3, step: 1, lastPractised: null, trend: null, timingConfidence: null });
  const blocks = cat.progressBlocks([
    row('rhythm.pulse', 'timing', 'practising'),
    row('vocal.pitch', 'judged', 'exploring'),
    row('listen.tempo', 'recognition', 'exploring'),
    row('listen.stroke', 'recognition', 'steady'),
    row('made.up', 'recognition', 'steady'),
    row('listen.phrase', 'recognition', 'top_of_class'),
  ]);
  assert.deepEqual(blocks.recognition.map((r) => r.skill), ['listen.stroke', 'listen.tempo']);
  assert.deepEqual(blocks.performance.map((r) => r.skill), ['rhythm.pulse', 'vocal.pitch']);
  assert.deepEqual(cat.PLAY_LABELS.map((l) => en.playground.label[l]), ['Exploring', 'Practising', 'Steady', 'Ready for Review']);
  for (const skill of ['listen.stroke', 'listen.phrase', 'listen.tempo', 'rhythm.sequence', 'rhythm.pulse', 'kirtan.recover']) {
    assert.ok(en.playground.skill[skill.replace('.', '_')], skill);
  }
  assert.equal(cat.gameForSkill('listen.tempo').route, '/student/playground/tempo-detective');
  assert.equal(cat.gameForSkill('vocal.pitch'), null);
  assert.equal(en.playground.progress.khol, 'Playing on your khol is checked by your facilitator in class.');
  const screen = src('screens/playground/progress.tsx');
  assert.match(screen, /progressBlocks/);
  assert.match(screen, /playground\.progress\.khol/);
});
