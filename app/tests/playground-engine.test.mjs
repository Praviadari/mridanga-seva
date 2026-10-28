// Unit tests for the Rhythm Playground engine (docs/RHYTHM_PLAYGROUND.md §8, §12.2, §15.1; docs/DECISIONS.md
// #720-#729): the spec's acceptance DYN-01..08 — approved content only, no back-to-back repeats, the curriculum guard,
// adaptive paths with manual override, seeded replay, the low-content fallback — and the parts: notation, checks,
// spaced review, labels, the offline round queue and the data layer's mapping. The database side (0065: approval,
// publishing, record_round's re-marking, row-level security, retention) is in supabase/tests/smoke-test.mjs.
// Run from app/: npm test.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import './stubs/register.mjs';

const { makeRng, hash32, roundSeed } = await import('../src/lib/playground/rng.ts');
const { isBeat, isSequence, sequenceBols, plainBeat, sameSound, bolIndex, writtenKey } = await import('../src/lib/playground/notation.ts');
const { whyIneligible, eligibleExercises, templateFor, allowedGuna, tempoInRange } = await import('../src/lib/playground/eligibility.ts');
const { checkChallenge, expectedAnswer, isRight } = await import('../src/lib/playground/check.ts');
const { generateRound, topStep, stepOf } = await import('../src/lib/playground/generator.ts');
const { seenItems, reviewsDue, pickExercises, avoidBackToBack, isLowContent, recentExclusion, pickDailyGames } = await import(
  '../src/lib/playground/repeat-guard.ts'
);
const { stepAdvice, stepLimits } = await import('../src/lib/playground/adaptive.ts');
const { skillProgress, labelRules, DEFAULT_LABEL_RULES } = await import('../src/lib/playground/labels.ts');
const queue = await import('../src/lib/playground/round-queue.ts');
const { cachedPack, savePack, forgetPack, cachedPackVersion } = await import('../src/lib/playground/pack-cache.ts');
const { GAME_IDS, SKILL_IDS, SKILL_KIND } = await import('../src/lib/playground/types.ts');
const { parsePack, parseRound, roundPayload, parseState, dropErrorName } = await import('../src/data/playground.ts');

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-10-28T10:00:00Z');

// ---------------------------------------------------------------- fixtures

const bol = (id, extra = {}) => ({
  id, written: extra.written ?? id, head: extra.head ?? 'dayan', technique: null, open: null, levelId: extra.levelId ?? 1,
  soundsLike: extra.soundsLike ?? [], closePairs: extra.closePairs ?? [], assetId: null, placeholder: extra.placeholder ?? false,
});
const BOLS = [
  bol('ta', { closePairs: ['na'] }), bol('na', { closePairs: ['ta'] }), bol('ti'), bol('te'), bol('ra', { soundsLike: ['re'] }),
  bol('re', { soundsLike: ['ra'] }), bol('ka', { head: 'baya', soundsLike: ['ke'] }), bol('ke', { head: 'baya', soundsLike: ['ka'] }),
  bol('ga', { head: 'baya' }), bol('gha', { head: 'baya' }), bol('dha', { head: 'both' }),
  bol('dhin', { head: 'both', levelId: 2 }), // taught at Intermediate
];
const template = (id, game, skill, steps, params = {}) => ({ id, game, skill, responseMode: 'choose', levelMin: 1, levelMax: 3, steps, params, revision: 1 });
const TEMPLATES = [
  template(1, 'sound_detective', 'listen.stroke', [{ step: 1, choices: 2, otherHead: true }, { step: 2, choices: 3 }, { step: 3, choices: 4 }, { step: 4, choices: 3, closePairs: true }]),
  template(2, 'missing_beat', 'listen.phrase', [{ step: 1, choices: 3, gaps: 1 }, { step: 2, choices: 4, gaps: 1 }, { step: 3, choices: 4, gaps: 2 }]),
  template(3, 'rhythm_builder', 'rhythm.sequence', [{ step: 1, extraTiles: 0 }, { step: 2, extraTiles: 2 }]),
  template(4, 'tempo_detective', 'listen.tempo', [{ step: 1, tempoDiff: 0.25 }, { step: 2, tempoDiff: 0.15 }, { step: 3, tempoDiff: 0.08 }]),
];
let nextId = 100;
const exercise = (game, sequence, extra = {}) => ({
  id: extra.id ?? nextId++, game, templateId: null, levelId: extra.levelId ?? 1, skills: extra.skills ?? [TEMPLATES.find((t) => t.game === game).skill],
  taalId: null, sequence, divisions: null, answer: extra.answer ?? {}, distractors: extra.distractors ?? [], promptAssets: extra.promptAssets ?? [],
  bpmMin: extra.bpmMin ?? 60, bpmMax: extra.bpmMax ?? 80, guna: extra.guna ?? [1], requiresItem: extra.requiresItem ?? null, locale: 'en',
  attribution: null, placeholder: extra.placeholder ?? false, revision: 1,
});
const SD = ['ta', 'na', 'ti', 'te', 'ra', 'ka', 'ga', 'gha', 'dha', 'te.re', 'ka.ta', 'ga.dha'].map((b, i) => exercise('sound_detective', [b], { id: i + 1 }));
const MB = [
  ['ta', 'na', 'ta', 'na'], ['te', 're', 'ka', 'ta'], ['dha', 'ga', 'na', 'ti'], ['ta', '-', 'ka', 'ta', 'gha', 'gha', '-', 'ta'],
  ['ga', 'gha', 'ta', 'na', 'ka', 'ti'], ['te.re', 'ka', 'ta', 'ga'], ['na', 'ti', 'na', 'ka'], ['dha', 'ga', 'ti', 'na'],
  ['ka', 'ta', 'ga', 'dha'], ['ta', 'ka', 'na', 'ga'], ['ti', 'te', 'ta', 'na'], ['gha', 'na', 'ti', 'ta'],
].map((s, i) => exercise('missing_beat', s, { id: 200 + i }));
const RB = [['ta', 'na', 'ka'], ['te', 're', 'ka', 'ta'], ['dha', 'ga', 'na'], ['ta', 'ta', 'gha', 'na'], ['ga', 'ti', 'na', 'ka'], ['na', 'gha', 'te'],
  ['ka', 'ta', 'ti'], ['dha', 'ti', 'gha', 'na'], ['ta', '-', 'na', 'ka'], ['ga', 'na', 'te', 're'], ['ti', 'ta', 'ka'], ['ka', 'ga', 'ta']]
  .map((s, i) => exercise('rhythm_builder', s, { id: 300 + i }));
const TD = [['ta', 'na', 'ta', 'na'], ['dha', 'ga', 'na', 'ti'], ['te', 're', 'ka', 'ta'], ['ga', 'gha', 'ta', 'na'], ['ta', '-', 'ka', 'ta'], ['na', 'ti', 'na', 'ka']]
  .map((s, i) => exercise('tempo_detective', s, { id: 400 + i, bpmMin: 56, bpmMax: 100 }));
// Not for a Beginner: dhin is an Intermediate bol; level 2; a draft-only placeholder; a ticked-item one.
const OFF_LIMITS = [
  exercise('sound_detective', ['dhin'], { id: 900 }),
  exercise('sound_detective', ['ta'], { id: 901, levelId: 2 }),
  exercise('sound_detective', ['na'], { id: 902, placeholder: true }),
  exercise('sound_detective', ['ti'], { id: 903, requiresItem: 77 }),
  exercise('sound_detective', ['xyz'], { id: 904 }),
];
const PACK = { version: 5, publishedAt: '2026-10-27T00:00:00Z', placeholders: false, bols: BOLS, assets: [], templates: TEMPLATES,
  exercises: [...SD, ...MB, ...RB, ...TD, ...OFF_LIMITS], labels: DEFAULT_LABEL_RULES };
const CTX = { pack: PACK, levelId: 1, levelUpOk: false, ticked: [] };
const INDEX = bolIndex(BOLS);

/** A round as the phone keeps it, from a generated one: answers right unless `wrong` lists the exercise. */
function played(gen, at, { wrong = [], id = `r${at}-${gen.recipe.seed}` } = {}) {
  return {
    id, game: gen.recipe.game, skill: gen.skill, mode: 'play', levelId: 1, step: gen.recipe.step, seed: gen.recipe.seed,
    contentVersion: gen.recipe.contentVersion, startedAt: new Date(at).toISOString(), finishedAt: new Date(at + 60000).toISOString(),
    items: gen.challenges.map((c) => ({ e: c.exerciseId, r: c.revision, a: c.answer, ok: !wrong.includes(c.exerciseId), rp: 0, rv: c.review })),
    timing: null, device: 'web',
  };
}

const gen = (game, seed, extra = {}) => generateRound({ ...CTX, game, step: 2, seed, mode: 'play', seen: [], now: NOW, ...extra });

// ---------------------------------------------------------------- rng, notation (#721, #722)

test('rng: the same seed gives the same numbers on every device; FNV-1a hash and the round seed are fixed', () => {
  const a = makeRng(42);
  const b = makeRng(42);
  const xs = Array.from({ length: 50 }, () => a.next());
  assert.deepEqual(xs, Array.from({ length: 50 }, () => b.next()));
  assert.ok(xs.every((x) => x >= 0 && x < 1));
  assert.notDeepEqual(xs.slice(0, 5), Array.from({ length: 5 }, makeRng(43).next));
  assert.equal(hash32(''), 0x811c9dc5);
  assert.equal(hash32('a'), 0xe40c292c);
  assert.equal(roundSeed('s1', 'echo', '2026-10-28', 1), roundSeed('s1', 'echo', '2026-10-28', 1));
  assert.notEqual(roundSeed('s1', 'echo', '2026-10-28', 1), roundSeed('s1', 'echo', '2026-10-28', 2));
  const r = makeRng(7);
  for (let i = 0; i < 200; i++) {
    const n = r.int(3, 6);
    assert.ok(Number.isInteger(n) && n >= 3 && n <= 6);
  }
  assert.deepEqual([...makeRng(9).shuffle([1, 2, 3, 4, 5])].sort(), [1, 2, 3, 4, 5]);
});

test('notation: beats are - or 1-4 dictionary ids joined with "."; the written form is plain; sounds-alike either way', () => {
  for (const ok of ['-', 'ta', 'te.re', 'ta.ka.ta.ka', 'dhin']) assert.ok(isBeat(ok), ok);
  for (const bad of ['', 'Tā', 'ta.', 'ta..na', 'ta.na.ta.na.ta', 'ta na', 'abcdefghijk']) assert.ok(!isBeat(bad), bad);
  assert.ok(isSequence(['ta', '-']));
  assert.ok(!isSequence([]));
  assert.ok(!isSequence(Array(33).fill('ta')));
  assert.deepEqual(sequenceBols(['te.re', '-', 'ka', 'te']), ['te', 're', 'ka']);
  assert.equal(plainBeat('Tā.Re'), 'ta.re');
  assert.equal(plainBeat(' - '), '-');
  assert.ok(sameSound('ka', 'ke', INDEX) && sameSound('ke', 'ka', INDEX));
  assert.ok(sameSound('te.ra ka', 'te.re ke', INDEX));
  assert.ok(!sameSound('ta', 'na', INDEX));
  assert.ok(!sameSound('ta -', 'ta ta', INDEX));
  assert.ok(!sameSound('ta', 'ta ta', INDEX));
  assert.equal(writtenKey('te.re ka', bolIndex([bol('te', { written: 'Te' }), bol('re', { written: 'Re' })])), 'Te·Re ka');
});

// ---------------------------------------------------------------- the curriculum guard (DYN-01, DYN-03, #723)

test('curriculum guard: level, the bols\' level, placeholders, ticked items, unknown bols, sounds', () => {
  const why = (id, ctx = CTX) => whyIneligible(PACK.exercises.find((e) => e.id === id), ctx);
  assert.equal(why(1), null);
  assert.equal(why(900), 'bol_level');
  assert.equal(why(901), 'level');
  assert.equal(why(902), 'placeholder');
  assert.equal(why(903), 'not_ticked');
  assert.equal(why(904), 'bol_unknown');
  assert.equal(why(903, { ...CTX, ticked: [77] }), null);
  assert.equal(why(900, { ...CTX, levelUpOk: true }), null, 'one level up when the facilitator allows it');
  assert.equal(why(901, { ...CTX, levelId: 2 }), null);
  assert.equal(why(902, { ...CTX, pack: { ...PACK, placeholders: true } }), null, 'TEST with placeholders on');
  const withPrompt = { ...SD[0], promptAssets: [55] };
  assert.equal(whyIneligible(withPrompt, CTX), 'sound_missing', 'a recorded prompt not in the pack');
  const packWithAsset = { ...PACK, assets: [{ id: 55, kind: 'phrase', path: 'phrase/x.m4a', placeholder: false, instruments: [] }] };
  assert.equal(whyIneligible(withPrompt, { ...CTX, pack: packWithAsset }), null);
  assert.equal(whyIneligible(withPrompt, { ...CTX, pack: packWithAsset, soundReady: () => false }), 'sound_missing', 'offline and not cached');
  assert.equal(whyIneligible({ ...SD[0], game: 'echo' }, CTX), 'no_template', 'a game with no approved template for the level');
  assert.deepEqual(eligibleExercises(CTX, 'sound_detective').map((e) => e.id), SD.map((e) => e.id));
});

test('DYN-01 / DYN-03: over 1,000 seeds every challenge uses only eligible exercises, approved bols of the level, tempos in range and allowed guna', () => {
  const allowed = new Set(BOLS.filter((b) => b.levelId <= 1).map((b) => b.id));
  const eligible = new Set(['sound_detective', 'missing_beat', 'rhythm_builder', 'tempo_detective'].flatMap((g) => eligibleExercises(CTX, g).map((e) => e.id)));
  let challenges = 0;
  for (let seed = 1; seed <= 1000; seed++) {
    const game = ['sound_detective', 'missing_beat', 'rhythm_builder', 'tempo_detective'][seed % 4];
    const step = 1 + (seed % 3);
    const round = gen(game, seed, { step });
    assert.deepEqual(round.dropped, [], `seed ${seed}: nothing dropped on good content`);
    for (const c of round.challenges) {
      challenges++;
      assert.ok(eligible.has(c.exerciseId), `seed ${seed}: exercise ${c.exerciseId}`);
      const ex = PACK.exercises.find((e) => e.id === c.exerciseId);
      for (const beat of [...c.prompt.beats, ...c.choices.flatMap((x) => x.beats)]) {
        for (const b of beat === '-' ? [] : beat.split('.')) assert.ok(allowed.has(b), `seed ${seed}: bol ${b}`);
      }
      assert.ok(tempoInRange(ex, c.prompt.bpm) && (!c.prompt.second || tempoInRange(ex, c.prompt.second.bpm)), `seed ${seed}: tempo`);
      assert.ok(allowedGuna(ex, null, 1).includes(c.prompt.guna));
      assert.equal(c.prompt.beats.join(' '), game === 'sound_detective' ? ex.sequence.join(' ') : ex.sequence.join(' '), 'the approved sequence, never a new one');
      assert.equal(checkChallenge(c, ex, templateFor(PACK, game, 1), 1, INDEX), null);
    }
  }
  assert.ok(challenges > 4000, String(challenges));
});

// ---------------------------------------------------------------- seeded replay (DYN-06, #725)

test('DYN-06: the same recipe, content version and history rebuild exactly the same round; another seed differs', () => {
  for (const game of ['sound_detective', 'missing_beat', 'rhythm_builder', 'tempo_detective']) {
    const a = gen(game, 123456);
    const b = gen(game, 123456);
    assert.deepEqual(a, b, game);
    assert.equal(a.recipe.seed, 123456);
    assert.equal(a.recipe.contentVersion, 5);
    assert.notDeepEqual(a.challenges, gen(game, 123457).challenges, game);
  }
});

test('variety: 10 sessions of a game differ in content or order (§15.1: at least 3 differ)', () => {
  const keys = new Set();
  for (let s = 0; s < 10; s++) keys.add(gen('sound_detective', roundSeed('stu', 'sound_detective', '2026-10-28', s)).challenges.map((c) => `${c.exerciseId}:${c.answer}:${c.choices.map((x) => x.key)}`).join('|'));
  assert.ok(keys.size >= 3, String(keys.size));
});

// ---------------------------------------------------------------- repeat guard (DYN-02, #724)

test('DYN-02: 10 sessions on a pool of 12: never the same exercise twice in a row, also across rounds', () => {
  for (const game of ['sound_detective', 'missing_beat', 'rhythm_builder']) {
    const rounds = [];
    let last = null;
    for (let s = 0; s < 10; s++) {
      const at = NOW - (10 - s) * 3600000;
      const round = gen(game, hash32(`${game}${s}`), { seen: seenItems(rounds), now: at });
      assert.equal(round.poolSize, 12);
      assert.equal(round.lowContent, false);
      for (const c of round.challenges) {
        assert.notEqual(c.exerciseId, last, `${game} session ${s}: ${c.exerciseId} twice in a row`);
        last = c.exerciseId;
      }
      rounds.push(played(round, at));
    }
  }
});

test('repeat guard: the last K items are left out (K = min(8, pool − round length)); fresh items are preferred', () => {
  assert.equal(recentExclusion(12, 6), 6);
  assert.equal(recentExclusion(20, 6), 8);
  assert.equal(recentExclusion(6, 6), 0);
  const seen = [1, 2, 3, 4, 5, 6].map((e, i) => ({ exerciseId: e, game: 'sound_detective', at: NOW - 600000 + i, ok: true, review: false }));
  const { picks } = pickExercises({ pool: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], game: 'sound_detective', roundLen: 6, seen, now: NOW, rng: makeRng(1) });
  assert.deepEqual(picks.map((p) => p.exerciseId).sort((a, b) => a - b), [7, 8, 9, 10, 11, 12]);
});

test('avoidBackToBack: repeats are spread out whenever the multiset allows it', () => {
  const p = (...ids) => ids.map((exerciseId) => ({ exerciseId, review: false }));
  for (let seed = 0; seed < 50; seed++) {
    const out = avoidBackToBack(p(1, 1, 1, 2, 2, 3), 1, makeRng(seed)).map((x) => x.exerciseId);
    assert.ok(out.every((id, i) => id !== (i === 0 ? 1 : out[i - 1])), out.join());
  }
  assert.deepEqual(avoidBackToBack(p(4, 4), null, makeRng(1)).map((x) => x.exerciseId), [4, 4], 'only one exercise: it repeats');
});

test('spaced review: a wrong item comes back after 1 day, then 3, then 7, labelled Review, at most a third of a round', () => {
  const wrongAt = NOW - 30 * DAY;
  const seen = (extra = []) => [{ exerciseId: 3, game: 'sound_detective', at: wrongAt, ok: false, review: false }, ...extra];
  assert.deepEqual(reviewsDue(seen(), 'sound_detective', wrongAt + DAY - 1), []);
  assert.equal(reviewsDue(seen(), 'sound_detective', wrongAt + DAY)[0].exerciseId, 3);
  const r1 = { exerciseId: 3, game: 'sound_detective', at: wrongAt + DAY, ok: true, review: true };
  assert.deepEqual(reviewsDue(seen([r1]), 'sound_detective', wrongAt + 3 * DAY), [], 'box 2: 3 days after the right review');
  assert.equal(reviewsDue(seen([r1]), 'sound_detective', wrongAt + 4 * DAY).length, 1);
  const r2 = { ...r1, at: wrongAt + 4 * DAY };
  assert.equal(reviewsDue(seen([r1, r2]), 'sound_detective', wrongAt + 10 * DAY).length, 0);
  assert.equal(reviewsDue(seen([r1, r2]), 'sound_detective', wrongAt + 11 * DAY).length, 1, 'box 3: 7 days');
  const r3 = { ...r1, at: wrongAt + 11 * DAY };
  assert.equal(reviewsDue(seen([r1, r2, r3]), 'sound_detective', NOW).length, 0, 'three right reviews: done');
  // In a generated round: due items are labelled and capped at a third.
  const many = [1, 2, 3, 4, 5].map((e) => ({ exerciseId: e, game: 'sound_detective', at: NOW - 2 * DAY, ok: false, review: false }));
  const round = gen('sound_detective', 99, { seen: many });
  const reviews = round.challenges.filter((c) => c.review);
  assert.equal(reviews.length, 2, 'floor(6 / 3)');
  assert.ok(reviews.every((c) => [1, 2, 3, 4, 5].includes(c.exerciseId)));
});

test('DYN-07: too few eligible items → "Review practice", items repeat but never back-to-back, nothing made up', () => {
  assert.ok(isLowContent(11, 6) && !isLowContent(12, 6) && isLowContent(5, 2));
  const small = { ...PACK, exercises: SD.slice(0, 3) };
  for (let seed = 0; seed < 30; seed++) {
    const round = gen('sound_detective', seed, { pack: small });
    assert.equal(round.lowContent, true);
    assert.equal(round.challenges.length, 6);
    assert.ok(round.challenges.every((c) => [1, 2, 3].includes(c.exerciseId)), 'only the approved items');
    round.challenges.forEach((c, i) => i > 0 && assert.notEqual(c.exerciseId, round.challenges[i - 1].exerciseId));
  }
  const empty = gen('sound_detective', 1, { pack: { ...PACK, exercises: [] } });
  assert.deepEqual([empty.challenges, empty.lowContent, empty.poolSize], [[], true, 0]);
});

test('skill rotation: Daily Mission games never repeat a skill back-to-back and avoid yesterday\'s set', () => {
  const options = [
    { game: 'sound_detective', skill: 'listen.stroke' }, { game: 'missing_beat', skill: 'listen.phrase' },
    { game: 'tempo_detective', skill: 'listen.tempo' }, { game: 'rhythm_builder', skill: 'rhythm.sequence' },
  ];
  for (let seed = 0; seed < 30; seed++) {
    const picks = pickDailyGames(options, ['sound_detective', 'missing_beat'], 2, makeRng(seed));
    assert.equal(picks.length, 2);
    assert.notEqual(picks[0].skill, picks[1].skill);
    assert.ok(!(picks.every((p) => ['sound_detective', 'missing_beat'].includes(p.game))), JSON.stringify(picks));
  }
});

// ---------------------------------------------------------------- the generator's games and the checks

test('Sound Detective: step 1 two cards on different heads, step 4 the close pair; no card sounds like the answer', () => {
  for (let seed = 0; seed < 200; seed++) {
    const s1 = gen('sound_detective', seed, { step: 1 });
    for (const c of s1.challenges) {
      assert.equal(c.choices.length, 2);
      const ans = INDEX.get(c.answer);
      if (ans && ans.head !== 'both') {
        const other = c.choices.find((x) => x.key !== c.answer);
        assert.notEqual(INDEX.get(other.key)?.head, ans.head, `seed ${seed}: ${c.answer} vs ${other.key}`);
      }
    }
    for (const c of gen('sound_detective', seed, { step: 4 }).challenges) {
      if (c.answer === 'ta') assert.ok(c.choices.some((x) => x.key === 'na'), 'ta with its close pair na');
      for (const x of c.choices) if (x.key !== c.answer) assert.ok(!sameSound(x.key, c.answer, INDEX));
    }
  }
});

test('Missing Beat: the gap is never a rest; the answer is the gap\'s bol; the full phrase stays the approved one', () => {
  for (let seed = 0; seed < 300; seed++) {
    for (const c of gen('missing_beat', seed, { step: 1 + (seed % 3) }).challenges) {
      const ex = MB.find((e) => e.id === c.exerciseId);
      assert.ok(c.prompt.gaps.every((g) => ex.sequence[g] !== '-'));
      assert.equal(c.answer, c.prompt.gaps.map((g) => ex.sequence[g]).join(' '));
      assert.deepEqual(c.prompt.beats, ex.sequence);
      assert.equal(expectedAnswer('missing_beat', ex, c.query), c.answer, 'what the server recomputes');
    }
  }
});

test('Tempo Detective: both tempos inside the approved range; faster / slower / same from the two', () => {
  const kinds = new Set();
  for (let seed = 0; seed < 300; seed++) {
    for (const c of gen('tempo_detective', seed, { step: 1 + (seed % 3) }).challenges) {
      const ex = TD.find((e) => e.id === c.exerciseId);
      assert.ok(tempoInRange(ex, c.query.bpm[0]) && tempoInRange(ex, c.query.bpm[1]), JSON.stringify(c.query));
      assert.equal(expectedAnswer('tempo_detective', ex, c.query), c.answer);
      kinds.add(c.answer);
    }
  }
  assert.deepEqual([...kinds].sort(), ['faster', 'same', 'slower']);
  const narrow = exercise('tempo_detective', ['ta', 'na'], { bpmMin: 70, bpmMax: 72 });
  const round = gen('tempo_detective', 3, { pack: { ...PACK, exercises: [narrow] }, step: 1 });
  assert.ok(round.challenges.every((c) => c.answer === 'same') && round.dropped.every((d) => d.reason === 'tempo_out_of_range'),
    'a range too narrow for the step: only "same", the others dropped (and reported)');
});

test('Rhythm Builder: every beat on a tile, extra tiles never sound like a needed one, the answer is the approved order', () => {
  for (let seed = 0; seed < 200; seed++) {
    for (const c of gen('rhythm_builder', seed, { step: 2 }).challenges) {
      const ex = RB.find((e) => e.id === c.exerciseId);
      assert.equal(c.answer, ex.sequence.join(' '));
      const needed = ex.sequence.filter((b) => b !== '-');
      assert.equal(c.choices.length, needed.length + 2);
      const extras = [...c.choices.map((x) => x.key)];
      for (const b of needed) extras.splice(extras.indexOf(b), 1);
      assert.ok(extras.every((x) => !needed.some((b) => sameSound(x, b, INDEX))), extras.join());
    }
  }
});

test('the challenge check drops a bad challenge: answer missing, sound-alike card, gap on a rest, tempo, guna', () => {
  const ok = gen('missing_beat', 5, { step: 1 }).challenges[0];
  const ex = MB.find((e) => e.id === ok.exerciseId);
  const t = templateFor(PACK, 'missing_beat', 1);
  assert.equal(checkChallenge(ok, ex, t, 1, INDEX), null);
  assert.equal(checkChallenge({ ...ok, choices: ok.choices.filter((x) => x.key !== ok.answer).concat({ key: 'ga', beats: ['ga'] }) }, ex, t, 1, INDEX) !== null, true);
  const sd = { ...gen('sound_detective', 5).challenges.find((c) => c.answer === 'ka') ?? { ...gen('sound_detective', 5).challenges[0], answer: 'ka' } };
  sd.choices = [{ key: 'ka', beats: ['ka'] }, { key: 'ke', beats: ['ke'] }];
  assert.equal(checkChallenge(sd, SD.find((e) => e.sequence[0] === 'ka'), templateFor(PACK, 'sound_detective', 1), 1, INDEX), 'card_sounds_like_answer');
  const rest = MB[3];
  assert.equal(checkChallenge({ ...ok, exerciseId: rest.id, prompt: { ...ok.prompt, beats: rest.sequence, gaps: [1] } }, rest, t, 1, INDEX), 'gap_on_rest');
  assert.equal(checkChallenge({ ...ok, prompt: { ...ok.prompt, bpm: 200 } }, ex, t, 1, INDEX), 'tempo_out_of_range');
  assert.equal(checkChallenge({ ...ok, prompt: { ...ok.prompt, guna: 4 } }, ex, t, 1, INDEX), 'guna_not_allowed');
  assert.deepEqual(allowedGuna({ ...ex, guna: [1, 2, 4] }, { ...t, params: { gunaByLevel: { 1: [1, 2] } } }, 1), [1, 2], 'the level narrows the guna');
});

test('answers: right by sound (ka = ke, ra = re), Sound Explorer as a set, a gap outside the beats is never right', () => {
  assert.ok(isRight('sound_detective', 'ka', 'ke', INDEX));
  assert.ok(isRight('missing_beat', 'te.re ka', 'te.ra ke', INDEX));
  assert.ok(!isRight('sound_detective', 'ta', 'na', INDEX));
  assert.ok(isRight('sound_explorer', 'kartal khol', 'khol kartal', INDEX));
  assert.ok(!isRight('tempo_detective', 'faster', 'slower', INDEX));
  assert.equal(expectedAnswer('missing_beat', MB[0], { gap: [9] }), null);
  assert.equal(expectedAnswer('missing_beat', MB[0], { gap: [3, 1] }), 'na na', 'gaps in order');
  assert.equal(expectedAnswer('sound_detective', { sequence: ['ta'], answer: { bols: ['ka'] } }, undefined), 'ka', 'an explicit answer wins');
  assert.equal(expectedAnswer('echo', MB[0], undefined), null, 'performance games are not re-marked');
});

test('steps: the template\'s step, the last one when asked for more; the top step', () => {
  const t = TEMPLATES[0];
  assert.equal(stepOf(t, 2).choices, 3);
  assert.equal(stepOf(t, 9).step, 4);
  assert.equal(topStep(t), 4);
  assert.equal(topStep(null), 1);
});

// ---------------------------------------------------------------- adaptive rules (DYN-04, #726)

test('DYN-04: success offers harder, struggle offers easier, mixed stays, 14 days away warms up, the facilitator\'s limits win', () => {
  const rnd = (at, step, rights, total = 5, rp = 0) => ({ id: `a${at}`, game: 'sound_detective', skill: 'listen.stroke', mode: 'play', levelId: 1, step,
    seed: 1, contentVersion: 1, startedAt: new Date(at).toISOString(), finishedAt: new Date(at + 1000).toISOString(),
    items: Array.from({ length: total }, (_, i) => ({ e: i, r: 1, ok: i < rights, rp })), timing: null, device: 'web' });
  const advice = (rounds, extra = {}) => stepAdvice({ rounds, topStep: 4, now: NOW, ...extra });
  assert.deepEqual(advice([]), { step: 1, offer: null, offerStep: null, warmUp: false, choosable: [1] }, 'first time: step 1');
  const success = [rnd(NOW - 3 * 3600000, 2, 4), rnd(NOW - 2 * 3600000, 2, 5)];
  assert.deepEqual([advice(success).offer, advice(success).offerStep, advice(success).step], ['harder', 3, 2]);
  assert.equal(advice([rnd(NOW - 7200000, 2, 5, 5, 2), rnd(NOW - 3600000, 2, 5, 5, 2)]).offer, null, 'many replays: not yet harder');
  const struggle = [rnd(NOW - 7200000, 3, 1), rnd(NOW - 3600000, 3, 2)];
  assert.deepEqual([advice(struggle).offer, advice(struggle).offerStep], ['easier', 2]);
  assert.equal(advice([rnd(NOW - 7200000, 2, 5), rnd(NOW - 3600000, 2, 1)]).offer, null, 'mixed: stay');
  const away = advice([rnd(NOW - 20 * DAY, 3, 5)]);
  assert.deepEqual([away.step, away.warmUp], [2, true]);
  assert.deepEqual(advice(success, { limits: { max: 2 } }).offer, null, 'the maximum stops the offer');
  assert.equal(advice(struggle, { limits: { min: 3 } }).offer, null, 'the minimum stops the easier offer');
  assert.equal(advice([], { limits: { min: 2 } }).step, 2);
  assert.deepEqual(advice(struggle).choosable, [1, 2, 3], 'by hand: any step up to the highest reached');
  assert.deepEqual(advice(struggle, { limits: { max: 2 } }).choosable, [1, 2]);
  assert.equal(advice(success, { timing: true, calibrated: false }).offer, null, 'timing games adapt only on a calibrated phone');
  assert.equal(advice(success, { timing: true, calibrated: true }).offer, 'harder');
  assert.deepEqual(stepLimits({ min: 1, max: 4 }, { stepMin: 2, stepMax: 3 }), { min: 2, max: 3 });
  assert.deepEqual(stepLimits(undefined, null), { min: 1 });
});

// ---------------------------------------------------------------- labels (§12.2, DYN-05, DYN-08, #727)

test('labels: Exploring, Practising, Steady, Ready for Review (recognition), with the numbers from the setting', () => {
  const r = (id, at, step, rights, total = 5, skill = 'listen.stroke') => ({ id, game: 'sound_detective', skill, mode: 'play', levelId: 1, step,
    seed: 1, contentVersion: 1, startedAt: new Date(at).toISOString(), finishedAt: new Date(at).toISOString(),
    items: Array.from({ length: total }, (_, i) => ({ e: i, r: 1, ok: i < rights, rp: 0 })), timing: null, device: 'web' });
  const label = (rounds, top = 4) => skillProgress(rounds, DEFAULT_LABEL_RULES, { 'listen.stroke': top }, NOW)[0];
  assert.equal(label([r('a', NOW - DAY, 1, 5)]).label, 'exploring');
  assert.equal(label([r('a', NOW - DAY, 1, 2), r('b', NOW - DAY, 1, 2)]).label, 'practising');
  const steady = [r('a', NOW - 3 * DAY, 2, 5), r('b', NOW - 3 * DAY, 2, 4), r('c', NOW - DAY, 2, 5), r('d', NOW - DAY, 2, 4)];
  assert.deepEqual([label(steady).label, label(steady).opportunities, label(steady).correct, label(steady).step], ['steady', 20, 18, 2]);
  assert.equal(label(steady.map((x) => ({ ...x, finishedAt: new Date(NOW - DAY).toISOString() }))).label, 'practising', 'all on one day: not yet steady');
  assert.equal(label(steady, 2).label, 'ready_for_review', 'steady at the top step');
  assert.equal(label([...steady, r('e', NOW - 40 * DAY, 2, 5)]).opportunities, 20, 'outside 30 days not counted');
  const timed = (id, at, med, calibrated = true) => ({ ...r(id, at, 1, 0, 1, 'rhythm.pulse'), game: 'tap_the_beat', items: [{ e: 1, r: 1 }],
    timing: { medianMs: med, spreadMs: 30, calibrated } });
  const pulse = (rounds) => skillProgress(rounds, DEFAULT_LABEL_RULES, { 'rhythm.pulse': 3 }, NOW)[0];
  assert.deepEqual([pulse([timed('t1', NOW - 2 * DAY, 10, false), timed('t2', NOW - DAY, 10, false), timed('t3', NOW, 10, false)]).label,
    pulse([timed('t1', NOW - 2 * DAY, 10, false)]).timingConfidence], ['exploring', 'not_calibrated'], 'DYN-08: no timing label on an uncalibrated phone');
  assert.equal(pulse([timed('t1', NOW - 2 * DAY, 10), timed('t2', NOW - DAY, -20), timed('t3', NOW, 40)]).label, 'steady');
  assert.equal(pulse([timed('t1', NOW - 2 * DAY, 10), timed('t2', NOW - DAY, 90), timed('t3', NOW, 40)]).label, 'practising');
  assert.equal(labelRules({ steadyItems: 10, timingMedianMs: 'x', bogus: 1 }).steadyItems, 10);
  assert.equal(labelRules({ timingMedianMs: 'x' }).timingMedianMs, 60);
  assert.equal(labelRules(null).practisingItems, 10);
  // Recognition and timing never added together: separate entries, recognition first.
  const both = skillProgress([...steady, timed('t1', NOW, 10)], DEFAULT_LABEL_RULES, {}, NOW);
  assert.deepEqual(both.map((p) => [p.skill, p.kind]), [['listen.stroke', 'recognition'], ['rhythm.pulse', 'timing']]);
});

test('types: 14 games, 18 skills, each skill has a kind', () => {
  assert.equal(GAME_IDS.length, 14);
  assert.equal(SKILL_IDS.length, 18);
  assert.ok(SKILL_IDS.every((s) => ['recognition', 'timing', 'judged'].includes(SKILL_KIND[s])));
});

// ---------------------------------------------------------------- offline round queue and pack cache (#728)

test('round queue: the same id once, sent oldest first, stops when offline, refused and too-old rounds leave', async () => {
  queue.forgetPlayground();
  const round = (id, ageDays) => ({ id, game: 'echo', skill: 'rhythm.recall', mode: 'play', levelId: 1, step: 1, seed: 1, contentVersion: 1,
    startedAt: new Date(Date.now() - ageDays * DAY).toISOString(), finishedAt: null, items: [{ e: 1, r: 1 }], timing: null, device: 'web' });
  queue.enqueueRound('me', round('a', 1));
  queue.enqueueRound('me', round('a', 1));
  queue.enqueueRound('me', round('b', 0.5));
  queue.enqueueRound('other', round('c', 0.5));
  queue.enqueueRound('me', round('old', 15));
  assert.equal(queue.queuedRounds().filter((q) => q.profileId === 'me').length, 3, 'a second tap replaces');
  const sent = [];
  let report = await queue.syncRounds('me', async (r) => (sent.push(r.id), r.id === 'a' ? 'saved' : 'offline'));
  assert.deepEqual(sent, ['a', 'b']);
  assert.deepEqual(report, { saved: 1, refused: 0, tooOld: 1, waiting: 1 });
  report = await queue.syncRounds('me', async () => 'refused');
  assert.deepEqual(report, { saved: 0, refused: 1, tooOld: 0, waiting: 0 });
  assert.deepEqual(queue.queuedRounds().map((q) => q.round.id), ['c'], 'another login\'s round is not sent');
  assert.deepEqual(queue.recentRounds('me').map((r) => r.id).sort(), ['a', 'b', 'old'], 'the history keeps the last 30 days (sent or not)');
  // One sending at a time: a second call gets the running one.
  queue.enqueueRound('me', round('d', 0));
  let release;
  const gate = new Promise((r) => (release = r));
  const first = queue.syncRounds('me', async () => (await gate, 'saved'));
  assert.equal(queue.syncRounds('me', async () => 'refused'), first);
  release();
  assert.equal((await first).saved, 1);
  // A sync with nothing waiting does not block the next one (W2 TEST walk 28-10-2026).
  assert.deepEqual(await queue.syncRounds('me', async () => 'saved'), { saved: 0, refused: 0, tooOld: 0, waiting: 0 });
  queue.enqueueRound('me', round('e', 0));
  assert.equal((await queue.syncRounds('me', async () => 'saved')).saved, 1, 'the round after an empty sync is sent');
  queue.forgetPlayground();
  assert.deepEqual([queue.queuedRounds(), queue.recentRounds('me')], [[], []], 'sign-out deletes both');
  assert.deepEqual(queue.mergeRounds([round('x', 1)], [round('x', 1), round('y', 0)]).map((r) => r.id), ['y', 'x']);
});

test('pack cache: kept on the phone, the version for the next request, forgotten', () => {
  forgetPack();
  assert.equal(cachedPack(), null);
  assert.equal(cachedPackVersion(), 0);
  savePack(PACK);
  assert.equal(cachedPack().version, 5);
  assert.equal(cachedPackVersion(), 5);
  forgetPack();
  assert.equal(cachedPack(), null);
});

// ---------------------------------------------------------------- the data layer's mapping

test('data: the server\'s pack and rounds map to the engine\'s types and back', () => {
  const pack = parsePack({
    version: 3, published_at: '2026-10-28', placeholders: true, labels: { steadyItems: 15 },
    bols: [{ id: 'ta', written: 'tā', head: 'dayan', level_id: 1, sounds_like: [], close_pairs: ['na'], asset_id: null, placeholder: true }],
    assets: [{ id: 2, kind: 'stroke', path: 'stroke/x.wav', licence: 'own', instruments: [], placeholder: false }],
    templates: [{ id: 1, game: 'sound_detective', skill: 'listen.stroke', response_mode: 'choose', level_min: 1, level_max: 3, steps: [{ step: 1 }], params: {}, revision: 1 }],
    exercises: [{ id: 7, game: 'sound_detective', template_id: 1, level_id: 1, skills: ['listen.stroke'], sequence: ['ta'], answer: {}, distractors: [],
      prompt_assets: [], bpm_min: '60.0', bpm_max: '80.0', guna: [1], requires_item: null, locale: 'en', placeholder: true, revision: 2 }],
  });
  assert.equal(pack.labels.steadyItems, 15);
  assert.equal(pack.labels.practisingItems, 10);
  assert.deepEqual([pack.exercises[0].bpmMin, pack.exercises[0].revision, pack.bols[0].closePairs[0], pack.templates[0].levelMax], [60, 2, 'na', 3]);
  const round = { id: 'r1', game: 'tap_the_beat', skill: 'rhythm.pulse', mode: 'daily', levelId: 1, step: 2, seed: 9, contentVersion: 3,
    startedAt: '2026-10-28T10:00:00.000Z', finishedAt: '2026-10-28T10:02:00.000Z', items: [{ e: 7, r: 2, ok: true }],
    timing: { medianMs: -12, spreadMs: 30, calibrated: true }, device: 'android' };
  const payload = roundPayload(round);
  assert.deepEqual(payload.timing, { median_ms: -12, spread_ms: 30, calibrated: true });
  assert.equal(payload.content_version, 3);
  assert.deepEqual(parseRound({ ...payload, level_id: 1 }), round);
  const state = parseState({ student_id: 's', level_id: 2, ticked: [1, 2], groups: [], settings: null, assignments: [], rounds: [] });
  assert.deepEqual(state.settings, { surprise: true, relaxedTiming: false, levelUpOk: false, steps: {} });
});

test('data: a dropped challenge is reported with no personal data, in the error log\'s shape', () => {
  const name = dropErrorName({ exerciseId: 1234567, templateId: 12, reason: 'card_sounds_like_answer' }, 345);
  assert.match(name, /^[A-Za-z][A-Za-z0-9_]{0,59}$/);
  assert.ok(name.startsWith('PlayCheck_card_sounds_like_answer_e1234567'));
  assert.ok(!/seed|student/i.test(name));
});

// ---------------------------------------------------------------- the shell components (§7 feedback words, §13.5)

test('shell: kind words only (never "wrong", "failed", "off beat"), every key in te and hi, large targets, no movement', async () => {
  const { readFileSync } = await import('node:fs');
  const src = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');
  const locale = (lang) => JSON.parse(src(`i18n/locales/${lang}.json`)).playEngine;
  const flat = (o, pre = '') => Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' ? flat(v, `${pre}${k}.`) : [[`${pre}${k}`, v]]));
  const en = flat(locale('en'));
  assert.ok(en.every(([, v]) => !/\b(wrong|failed|fail|off beat|incorrect)\b/i.test(v)), en.filter(([, v]) => /wrong|fail/i.test(v)).join());
  for (const lang of ['te', 'hi']) assert.deepEqual(flat(locale(lang)).map(([k]) => k), en.map(([k]) => k), lang);
  for (const file of ['game-shell', 'choice-cards', 'feedback-panel', 'round-summary', 'instructions-preview']) {
    const code = src(`components/playground/${file}.tsx`);
    assert.ok(!/Animated|LayoutAnimation|withTiming|useSharedValue/.test(code), `${file}: no animation`);
    for (const m of code.matchAll(/minHeight: (\d+)/g)) assert.ok(Number(m[1]) >= 48, `${file}: target ${m[1]}`);
  }
  const cards = src('components/playground/choice-cards.tsx');
  assert.ok(cards.includes('accessibilityLabel') && cards.includes("accessibilityRole=\"radio\""), 'cards read by the screen reader');
  assert.ok(src('components/playground/feedback-panel.tsx').includes('announce('), 'the result is read out once');
  assert.ok(src('lib/device-traces.ts').includes('forgetPlayground()'), 'sign-out deletes the rounds on the phone');
});