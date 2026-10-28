// Unit tests for the Rhythm Playground's facilitator content manager (package W3; docs/DECISIONS.md #740-#749;
// docs/RHYTHM_PLAYGROUND.md §8.4, §8.7, §10, §12.2, §19.3): the forms read in the bol notation as 0065 checks it,
// the status changes each login may offer, the approval queue, what the next publish changes, pool sizes, the
// preview's sample challenges (W1's generator, same seeds every time), Class progress order, and the guards: no
// placeholder written by the app, never the word "Guru" on screen, the te/hi drafts complete, the Teaching row and
// the Student profile section in place. Run from app/: npm test.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

import './stubs/register.mjs';

const rules = await import('../src/screens/staff-playground/content-rules.ts');
const { DEFAULT_LABEL_RULES } = await import('../src/lib/playground/labels.ts');

const src = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const locale = (lang) => JSON.parse(src(`i18n/locales/${lang}.json`));

// ---------------------------------------------------------------- a small content set (as staff read it)

const meta = (over = {}) => ({
  status: 'approved', revision: 1, placeholder: false, publishedIn: 1, firstPublishedIn: 1, createdBy: 'u1', updatedAt: '2026-10-20T10:00:00Z', ...over,
});
const bol = (id, head, over = {}) => ({
  id, written: id, head, technique: null, open: null, levelId: 1, soundsLike: [], closePairs: [], assetId: null, transcription: null, ...meta(), ...over,
});
const template = (id, game, skill, steps, over = {}) => ({
  id, game, skill, responseMode: 'choose', levelMin: 1, levelMax: 3, steps, params: { roundLen: 6 }, ...meta(), ...over,
});
const exercise = (id, game, sequence, over = {}) => ({
  id, game, templateId: null, levelId: 1, skills: ['listen.stroke'], taalId: null, sequence, divisions: null, answer: {}, distractors: [],
  promptAssets: [], bpmMin: 60, bpmMax: 80, guna: [1], requiresItem: null, locale: 'en', attribution: null, ...meta(), ...over,
});

const content = () => ({
  bols: [bol('te', 'dayan'), bol('re', 'dayan'), bol('khe', 'baya'), bol('ta', 'dayan'), bol('na', 'dayan', { status: 'in_review', publishedIn: null, firstPublishedIn: null, updatedAt: '2026-10-27T09:00:00Z' })],
  assets: [],
  templates: [
    template(1, 'sound_detective', 'listen.stroke', [{ step: 1, choices: 2, len: [1, 1], otherHead: true }, { step: 2, choices: 3, len: [1, 1] }]),
    template(2, 'missing_beat', 'listen.phrase', [{ step: 1, choices: 3, gaps: 1, grid: true }]),
  ],
  exercises: [
    exercise(10, 'sound_detective', ['te']),
    exercise(11, 'sound_detective', ['khe'], { status: 'in_review', publishedIn: null, updatedAt: '2026-10-26T09:00:00Z' }),
    exercise(12, 'missing_beat', ['te', 're', 'khe', 'ta'], { skills: ['listen.phrase'] }),
    exercise(13, 'sound_detective', ['ta'], { publishedIn: null, firstPublishedIn: null }),
    exercise(14, 'sound_detective', ['re'], { status: 'retired', publishedIn: null, updatedAt: '2026-10-25T09:00:00Z' }),
  ],
  latest: { version: 3, publishedAt: '2026-10-22T00:00:00Z', note: null, counts: {} },
});

// ---------------------------------------------------------------- forms

test('beats are read as the class writes them and stored as dictionary ids', () => {
  assert.deepEqual(rules.readBeats('Te.Re  khe tā -'), { beats: ['te.re', 'khe', 'ta', '-'], problem: null });
  assert.equal(rules.readBeats('  ').problem, 'empty');
  assert.equal(rules.readBeats('te..re').problem, 'notation');
  assert.equal(rules.readBeats('te.re.khe.ta.na').problem, 'notation');
  assert.equal(rules.readBeats(Array(33).fill('ta').join(' ')).problem, 'tooLong');
});

test('vibhags add up to the beats; distractors one per line; tempos 30-240; ids lower case', () => {
  assert.deepEqual(rules.readDivisions('4 4', 8), { divisions: [4, 4], problem: false });
  assert.deepEqual(rules.readDivisions('4 3', 8), { divisions: null, problem: true });
  assert.deepEqual(rules.readDivisions('', 8), { divisions: null, problem: false });
  assert.deepEqual(rules.readDistractors('na\nte re\n\nna'), { distractors: ['na', 'te re'], problem: false });
  assert.equal(rules.readDistractors('na!').problem, true);
  assert.equal(rules.readDistractors(Array.from({ length: 13 }, (_, i) => 'ta'.repeat(1) + String.fromCharCode(97 + i)).join('\n')).problem, true);
  assert.deepEqual(rules.readBpm('72,5'), { bpm: 72.5, problem: false });
  assert.deepEqual(rules.readBpm(''), { bpm: null, problem: false });
  assert.equal(rules.readBpm('300').problem, true);
  assert.deepEqual(rules.readIds('Ka, ke  ka'), ['ka', 'ke']);
});

test('template steps: 1-20 objects, each with its own whole step 1-20', () => {
  assert.equal(rules.stepsOk([{ step: 1 }, { step: 2, choices: 3 }]), true);
  assert.equal(rules.stepsOk([]), false);
  assert.equal(rules.stepsOk([{ step: 1 }, { step: 1 }]), false);
  assert.equal(rules.stepsOk([{ step: 0 }]), false);
  assert.equal(rules.stepsOk([{ step: 1.5 }]), false);
  assert.equal(rules.stepsOk([[1]]), false);
  assert.deepEqual(rules.readJson('[{"step":1}]', 'array'), [{ step: 1 }]);
  assert.equal(rules.readJson('{"a":1}', 'array'), null);
  assert.equal(rules.readJson('not json', 'object'), null);
});

// ---------------------------------------------------------------- the approval flow (#720)

test('coordinators move drafts to review and back; only the head facilitator approves, retires, restores', () => {
  assert.deepEqual(rules.statusActions('draft', false), ['submit']);
  assert.deepEqual(rules.statusActions('in_review', false), ['unsubmit']);
  assert.deepEqual(rules.statusActions('approved', false), []);
  assert.deepEqual(rules.statusActions('retired', false), []);
  assert.deepEqual(rules.statusActions('in_review', true), ['approve', 'sendBack', 'retire']);
  assert.deepEqual(rules.statusActions('approved', true), ['retire']);
  assert.deepEqual(rules.statusActions('retired', true), ['restore']);
  for (const a of ['submit', 'unsubmit', 'approve', 'sendBack', 'retire', 'restore']) assert.ok(rules.ACTION_STATUS[a]);
});

test('a draft never published is deleted by its author or the head facilitator only', () => {
  const draft = meta({ status: 'draft', firstPublishedIn: null, createdBy: 'u1' });
  assert.equal(rules.canDelete(draft, false, 'u1'), true);
  assert.equal(rules.canDelete(draft, false, 'u2'), false);
  assert.equal(rules.canDelete(draft, true, 'u2'), true);
  assert.equal(rules.canDelete({ ...draft, firstPublishedIn: 2 }, true, 'u1'), false);
  assert.equal(rules.canDelete({ ...draft, status: 'in_review' }, true, 'u1'), false);
  assert.equal(rules.canEdit(meta({ status: 'retired' }), true), false);
  assert.equal(rules.canEdit(null, true), true);
});

test('the approval queue: bols before exercises, oldest first, only what waits', () => {
  const queue = rules.approvalQueue(content());
  assert.deepEqual(queue.map((r) => `${r.kind}:${r.id}`), ['bol:na', 'exercise:11']);
});

test('the next publish: new, changed, and what left the pack since the last version', () => {
  const next = rules.nextPublish(content());
  assert.deepEqual(next.added.map((r) => r.id), ['13']);
  assert.deepEqual(next.revised.map((r) => r.id), []);
  assert.deepEqual(next.leaving.map((r) => r.id).sort(), ['11', '14']);
  const c = content();
  c.exercises[0] = { ...c.exercises[0], publishedIn: null, revision: 2 };
  assert.deepEqual(rules.nextPublish(c).revised.map((r) => r.id), ['10']);
  c.bols[0] = { ...c.bols[0], placeholder: true };
  assert.equal(rules.approvedPlaceholders(c), 1);
});

test('pool sizes per game and level; enough = max(6, 2 × round length) (§8.7)', () => {
  assert.deepEqual(rules.poolSizes(content().exercises), [
    { game: 'missing_beat', levelId: 1, approved: 1, waiting: 0 },
    { game: 'sound_detective', levelId: 1, approved: 2, waiting: 1 },
  ]);
  assert.equal(rules.enoughFor(6), 12);
  assert.equal(rules.enoughFor(2), 6);
});

// ---------------------------------------------------------------- preview (DYN-06)

test('preview: five sample challenges of one exercise, the same every time, answer among the cards', () => {
  const c = content();
  const ex = c.exercises[0];
  const a = rules.previewRounds(ex, c, 1);
  const b = rules.previewRounds(ex, c, 1);
  assert.equal(a.length, 5);
  assert.deepEqual(a, b);
  for (const r of a) {
    assert.equal(r.challenges.length, 1, JSON.stringify(r.dropped));
    const ch = r.challenges[0];
    assert.equal(ch.answer, 'te');
    assert.equal(ch.choices.length, 2);
    assert.ok(ch.choices.some((x) => x.key === 'te'));
  }
});

test('preview: Missing Beat leaves one place silent and its bol is the answer; a draft exercise previews too', () => {
  const c = content();
  const ex = { ...c.exercises[2], status: 'draft', publishedIn: null, firstPublishedIn: null };
  for (const r of rules.previewRounds(ex, c, 1)) {
    const ch = r.challenges[0];
    assert.ok(ch, JSON.stringify(r.dropped));
    assert.equal(ch.prompt.gaps.length, 1);
    assert.equal(ch.answer, ex.sequence[ch.prompt.gaps[0]]);
  }
});

test('preview: a game with no template gives nothing to show (the screen says to add one)', () => {
  const c = content();
  const ex = exercise(20, 'tempo_detective', ['te', 're']);
  assert.equal(rules.templateOf(ex, c.templates), null);
  assert.ok(rules.previewRounds(ex, c, 1).every((r) => r.challenges.length === 0));
});

// ---------------------------------------------------------------- Class progress

const NOW = Date.parse('2026-10-28T12:00:00Z');
const round = (id, startedAt, n, ok, step = 1) => ({
  id, game: 'sound_detective', skill: 'listen.stroke', mode: 'play', levelId: 1, step, seed: 1, contentVersion: 3, startedAt, finishedAt: startedAt,
  items: Array.from({ length: n }, (_, i) => ({ e: 10, r: 1, a: 'te', ok: i < ok, rp: 0 })), timing: null, device: 'web',
});

test('Class progress: Ready for Review first, then the longest without practice (never played first), then by name', () => {
  const tpl = [template(1, 'sound_detective', 'listen.stroke', [{ step: 1 }])];
  const students = [
    { studentId: 'a', fullName: 'Asha', levelId: 1, rounds: [round('a1', '2026-10-27T10:00:00Z', 4, 2)] },
    { studentId: 'b', fullName: 'Bala', levelId: 1, rounds: [round('b1', '2026-10-25T10:00:00Z', 10, 10), round('b2', '2026-10-26T10:00:00Z', 10, 9)] },
    { studentId: 'c', fullName: 'Chitra', levelId: 1, rounds: [] },
    { studentId: 'd', fullName: 'Dev', levelId: 1, rounds: [round('d1', '2026-10-20T10:00:00Z', 4, 4)] },
  ];
  const rows = rules.classRows(students, tpl, DEFAULT_LABEL_RULES, NOW);
  assert.deepEqual(rows.map((r) => r.fullName), ['Bala', 'Chitra', 'Dev', 'Asha']);
  assert.equal(rows[0].ready, true);
  assert.equal(rows[0].skills[0].label, 'ready_for_review');
  assert.equal(rows[1].lastPlayed, null);
  // A step below the top is Steady, not Ready for Review.
  const two = [template(1, 'sound_detective', 'listen.stroke', [{ step: 1 }, { step: 2 }])];
  assert.equal(rules.classRows(students, two, DEFAULT_LABEL_RULES, NOW).find((r) => r.studentId === 'b').skills[0].label, 'steady');
});

test('ratings are for performance skills only; due days in whole weeks', async () => {
  const { SKILL_IDS, SKILL_KIND } = await import('../src/lib/playground/types.ts');
  const rated = rules.ratedSkills(SKILL_IDS, SKILL_KIND);
  assert.ok(rated.includes('vocal.pitch') && rated.includes('rhythm.pulse'));
  assert.ok(!rated.includes('listen.stroke'));
  assert.equal(rules.dueAfter('2026-10-28', 2), '2026-11-11');
  assert.equal(rules.dueAfter('2026-10-28', null), null);
});

// ---------------------------------------------------------------- guards

test('the app never writes a placeholder row: every content insert says placeholder: false (§19.3)', () => {
  const admin = src('data/playground-admin.ts');
  for (const table of ['play_bols', 'play_templates', 'play_exercises']) {
    const inserts = admin.split(`from('${table}').insert(`).slice(1);
    assert.ok(inserts.length > 0, table);
    for (const call of inserts) assert.match(call.slice(0, 120), /placeholder: false/, table);
  }
  assert.match(admin, /bundled_key[\s\S]{0,400}placeholder: false/);
  assert.doesNotMatch(admin, /placeholder: true/);
});

test('never the word "Guru" on the facilitator screens, in English, Telugu or Hindi', () => {
  for (const lang of ['en', 'te', 'hi']) {
    const text = JSON.stringify(locale(lang).staffPlayground);
    assert.doesNotMatch(text, /guru|गुरु|గురు/i, lang);
  }
});

test('te and hi drafts have every English key, with their own words', () => {
  const keys = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' ? keys(v, `${p}${k}.`) : [`${p}${k}`]));
  const en = locale('en').staffPlayground;
  const leaf = (o, key) => key.split('.').reduce((x, k) => x[k], o);
  for (const lang of ['te', 'hi']) {
    const own = locale(lang).staffPlayground;
    assert.deepEqual(keys(own).sort(), keys(en).sort(), lang);
    const same = keys(en).filter((k) => leaf(own, k) === leaf(en, k) && /[a-z]{4}/.test(leaf(en, k)));
    assert.ok(same.length < 5, `${lang} still English: ${same.join(', ')}`);
  }
});

test('Teaching → Rhythm Playground row, the Student profile section, and every route opening its screen', () => {
  assert.match(src('lib/facilitator-modules.ts'), /key: 'playground', icon: 'listen', label: 'staffPlayground\.title', href: '\/staff\/playground'/);
  const profile = src('app/staff/students/[id].tsx');
  assert.match(profile, /<PlaygroundPanel studentId=\{student\.id\} studentName=\{student\.fullName\} ownRecord=\{ownRecord\} \/>/);
  const dir = new URL('../src/app/staff/playground/', import.meta.url);
  const files = readdirSync(dir, { recursive: true }).filter((f) => String(f).endsWith('.tsx'));
  assert.equal(files.length, 10);
  for (const f of files) assert.match(readFileSync(new URL(String(f).replace(/\\/g, '/'), dir), 'utf8'), /from '@\/screens\/staff-playground\//, String(f));
  assert.match(src('web-routes/area-screens.ts'), /staff\/playground\/exercise\/\[id\]/);
});
