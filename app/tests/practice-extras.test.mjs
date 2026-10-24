// Unit tests for the practice extras (docs/DECISIONS.md #490-#495): layakari timing and its grid text, silent bars /
// cycles in the loop and the playhead's cycle count, the kartal layer and its volume, the milestones, the staff list's
// goal guess, and the screens' wiring. The database side (0056) is in supabase/tests/smoke-test.mjs. Run from app/:
// npm test.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import './stubs/register.mjs';

const {
  cycleAt,
  cyclesPassed,
  cyclesPerLoop,
  layaBeats,
  layaGroups,
  layaText,
  metronomePattern,
  silentFits,
  taalPattern,
  withKartal,
  withSilentCycles,
  MAX_LOOP_SECONDS,
} = await import('../src/lib/practice-pattern.ts');
const { eventGain, renderLoop } = await import('../src/lib/practice-sounds.ts');
const { milestones, milestoneProgress, milestoneSummary, MILESTONE_IDS } = await import('../src/lib/milestones.ts');
const { weekGoalMet } = await import('../src/lib/practice-goal.ts');

const src = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const locale = (lang) => JSON.parse(src(`i18n/locales/${lang}.json`));
const round = (x) => Math.round(x * 1e6) / 1e6;
const strokes = (p) => p.events.filter((e) => !e.layer);

// ---------------------------------------------------------------- layakari (#491)

const TEENTAL4 = ['dhā', 'ti', 'te.re', '-'];

test('layakari: at barabar the pattern is the same as before (key and every stroke)', () => {
  const p = taalPattern(TEENTAL4);
  assert.equal(p.key, `taal:${TEENTAL4.join(' ')}`);
  assert.deepEqual(taalPattern(TEENTAL4, 1), p);
  // dhā = two strokes at 0, ti at 1, te at 2, re at 2.5, the rest nothing.
  assert.deepEqual(p.events.map((e) => [round(e.at), e.beat, e.part]), [[0, 0, 0], [0, 0, 0], [1, 1, 0], [2, 2, 0], [2.5, 2, 1]]);
});

test('layakari: dugun puts two written beats in each beat, the cycle keeps its length', () => {
  const p = taalPattern(TEENTAL4, 2);
  assert.equal(p.beats, 4);
  assert.match(p.key, /:x2$/);
  // Beat 0: dhā | ti; beat 1: te.re | -; beat 2: dhā | ti (the theka again); beat 3: te.re | -.
  assert.deepEqual(
    strokes(p).map((e) => [round(e.at), e.beat, e.part, e.sound]),
    [
      [0, 0, 0, 'ta'], [0, 0, 0, 'ga'], [0.5, 0, 1, 'ti'],
      [1, 1, 0, 'te'], [1.25, 1, 1, 'ra'],
      [2, 2, 0, 'ta'], [2, 2, 0, 'ga'], [2.5, 2, 1, 'ti'],
      [3, 3, 0, 'te'], [3.25, 3, 1, 'ra'],
    ],
  );
});

test('layakari: tigun and chaugun go round the theka 3 and 4 times in one cycle, evenly', () => {
  const bols = ['dhā', 'ti', 'tā', 'ka', 'tā', 'ti', 'dhā', 'dhin'];
  for (const laya of [3, 4]) {
    const p = taalPattern(bols, laya);
    const starts = strokes(p).filter((e, i, all) => i === 0 || round(e.at) !== round(all[i - 1].at));
    assert.equal(starts.length, bols.length * laya, `laya ${laya}: one stroke time per written beat`);
    starts.forEach((e, i) => assert.equal(round(e.at), round(i / laya), `laya ${laya}: stroke ${i} at ${i}/${laya} beat`));
    assert.equal(Math.max(...p.events.map((e) => e.at)) < bols.length, true);
  }
});

test('layakari: a delayed stroke (jhā) keeps its share of the shorter bol', () => {
  const p = taalPattern(['jhā', '-'], 2);
  const [ga, ta] = strokes(p);
  assert.equal(ga.at, 0);
  assert.equal(round(ta.at), round(0.18 * 0.5));
});

test('layakari: the groups wrap round the cycle, and the two-head view reads the bols by part', () => {
  const groups = layaGroups(['a', 'b', 'c'], 2);
  assert.deepEqual(groups.map((g) => g.map((x) => x.from)), [[0, 1], [2, 0], [1, 2]]);
  const beats = layaBeats(TEENTAL4, 2);
  assert.deepEqual(beats[1].map((b) => b.text), ['te', 're', '-']);
  // Each stroke's part points at its bol in layaBeats.
  for (const e of strokes(taalPattern(TEENTAL4, 2))) assert.notEqual(beats[e.beat][e.part].text, '-');
});

test('layakari: the grid writes each written beat as one word, rests as –', () => {
  const groups = layaGroups(TEENTAL4, 2);
  assert.equal(layaText(groups[0]), 'dhā ti');
  assert.equal(layaText(groups[1]), 'tere –');
  assert.equal(layaText(layaGroups(TEENTAL4, 1)[2]), 'te re');
  assert.equal(layaText(layaGroups(TEENTAL4, 1)[3]), '–');
});

// ---------------------------------------------------------------- silent bars / cycles (#490)

test('silent cycles: play 2, mute 1 makes a loop of three cycles with sound only in the first two', () => {
  const cycle = taalPattern(['dhā', 'tā', 'tā', 'ka']);
  const loop = withSilentCycles(cycle, 2, 1);
  assert.equal(loop.beats, 12);
  assert.deepEqual(loop.silent, { cycleBeats: 4, play: 2, mute: 1 });
  assert.equal(loop.events.length, cycle.events.length * 2);
  assert.ok(loop.events.every((e) => e.at < 8), 'nothing sounds in the silent cycle');
  // The copies keep their beat within the cycle (the grid and the two-head view read it).
  assert.deepEqual(loop.events.filter((e) => e.at >= 4).map((e) => e.beat), cycle.events.map((e) => e.beat));
  assert.notEqual(loop.key, cycle.key);
});

test('silent cycles: off, or none to mute, leaves the pattern as it is', () => {
  const bar = metronomePattern(4);
  assert.equal(withSilentCycles(bar, 2, 0), bar);
  assert.equal(cyclesPerLoop(bar), 1);
  assert.deepEqual(cycleAt(bar, 3.5), { beat: 3.5, cycleInLoop: 0, silent: false });
});

test('silent cycles: the playhead counts taal cycles and knows the silent ones', () => {
  const loop = withSilentCycles(metronomePattern(4), 2, 2);
  assert.equal(cyclesPerLoop(loop), 4);
  assert.deepEqual(cycleAt(loop, 0), { beat: 0, cycleInLoop: 0, silent: false });
  assert.deepEqual(cycleAt(loop, 5.5), { beat: 1.5, cycleInLoop: 1, silent: false });
  assert.deepEqual(cycleAt(loop, 8), { beat: 0, cycleInLoop: 2, silent: true });
  assert.deepEqual(cycleAt(loop, 15.99).cycleInLoop, 3);
  assert.equal(cycleAt(loop, 15.99).silent, true);
  // The phone's loop starts at 0 again after 16 beats: one loop passed = 4 cycles (lib/use-playhead.ts).
  const loops = cyclesPassed({ beat: 15.9, cycle: 0 }, { beat: 0.1, cycle: 0 }, loop.beats);
  assert.equal(loops * cyclesPerLoop(loop) + cycleAt(loop, 0.1).cycleInLoop, 4);
});

test('silent cycles: the loop must fit in the phone\'s one file (160 s)', () => {
  assert.equal(MAX_LOOP_SECONDS, 160);
  // 16 beats at 60: 16 s a cycle → 4 + 4 = 128 s fits; at 30 (50 % of 60): 256 s does not.
  assert.equal(silentFits(16, 60, 4, 4), true);
  assert.equal(silentFits(16, 30, 4, 4), false);
  assert.equal(silentFits(16, 30, 2, 2), true);
  assert.equal(silentFits(8, 0, 1, 1), false);
});

test('silent cycles: the screen shows "Silent: keep playing" and no stroke on the drum while silent', () => {
  const screen = src('screens/practice-tools.tsx');
  assert.match(screen, /<SilentFields value=\{silent\}/);
  assert.match(screen, /!head\.silent/);
  assert.match(src('components/practice-more.tsx'), /practiceExtras\.silentNow/);
  assert.match(src('lib/use-playhead.ts'), /silent: where\.silent/);
});

// ---------------------------------------------------------------- kartal (#492)

test('kartal: one stroke a beat on its own layer, ringing on the first beat of each vibhag', () => {
  const p = withKartal(taalPattern(['dhā', 'ti', 'tā', 'tā', 'ra', 'ti']), [3, 3]);
  const k = p.events.filter((e) => e.layer === 'kartal');
  assert.deepEqual(k.map((e) => e.at), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(k.map((e) => e.sound), ['kartal', 'kartalClosed', 'kartalClosed', 'kartal', 'kartalClosed', 'kartalClosed']);
  assert.match(p.key, /:kartal$/);
  // Sorted, the kartal before the stroke at the same moment.
  assert.ok(p.events.every((e, i) => i === 0 || p.events[i - 1].at <= e.at));
  assert.equal(p.events[0].layer, 'kartal');
});

test('kartal: on the beats also at layakari, and silent with the strokes in a silent cycle', () => {
  const p = withSilentCycles(withKartal(taalPattern(['dhā', 'tā'], 4), [2]), 1, 1);
  const k = p.events.filter((e) => e.layer === 'kartal');
  assert.deepEqual(k.map((e) => e.at), [0, 1]);
});

test('kartal: its volume scales only its own layer when the phone mixes the loop', () => {
  const kartalOnly = { beats: 1, events: [{ at: 0, beat: 0, part: -1, sound: 'kartal', layer: 'kartal' }], key: 'k' };
  const full = renderLoop(kartalOnly, 60, 8000, { kartal: 1 });
  const half = renderLoop(kartalOnly, 60, 8000, { kartal: 0.5 });
  const off = renderLoop(kartalOnly, 60, 8000, { kartal: 0 });
  const peak = (a) => a.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
  assert.ok(peak(full) > 0);
  assert.ok(Math.abs(peak(half) - peak(full) / 2) < 1e-6);
  assert.equal(peak(off), 0);
  assert.equal(eventGain({ at: 0, beat: 0, part: 0, sound: 'ta' }, { kartal: 0 }), 1, 'the strokes stay at full volume');
  assert.equal(eventGain(kartalOnly.events[0], {}), 1);
  assert.equal(eventGain(kartalOnly.events[0], { kartal: 3 }), 1);
});

test('kartal: both players take a layer volume (web: a gain per layer; phone: mixed in again)', () => {
  assert.match(src('lib/practice-player.ts'), /setLayerVolume\(layer: Layer, volume: number\): void;/);
  assert.match(src('lib/practice-audio.web.ts'), /gain\.gain\.setValueAtTime\(v, this\.ctx\.currentTime\)/);
  assert.match(src('lib/practice-audio.ts'), /renderLoop\(pattern, this\.bpm, RATE, this\.volumes\)/);
  assert.match(src('screens/practice-tools.tsx'), /player\.setLayerVolume\('kartal', kartalVolume\)/);
});

// ---------------------------------------------------------------- milestones (#493)

const goal = { days: 3, minutes: 15 };
/** `minutes` on each of these days. */
const on = (minutes, ...days) => days.map((d) => ({ on: d, minutes }));
const byId = (list) => Object.fromEntries(list.map((m) => [m.id, m]));

test('milestones: none before any practice; the first practice is the first milestone', () => {
  const none = byId(milestones([], goal, '2026-10-22'));
  assert.deepEqual(Object.keys(none), [...MILESTONE_IDS]);
  assert.ok(Object.values(none).every((m) => m.reachedOn === null));
  const first = byId(milestones(on(5, '2026-10-21'), goal, '2026-10-22'));
  assert.equal(first.first.reachedOn, '2026-10-21');
  assert.equal(first.days7.have, 1);
});

test('milestones: 7 practice days on the 7th day, two entries of a day count once', () => {
  const days = [...on(10, '2026-10-01', '2026-10-01', '2026-10-03', '2026-10-05', '2026-10-08', '2026-10-09', '2026-10-12'), ...on(10, '2026-10-20')];
  const m = byId(milestones(days, goal, '2026-10-22'));
  assert.equal(m.days7.have, 7);
  assert.equal(m.days7.reachedOn, '2026-10-20');
  assert.equal(m.days30.reachedOn, null);
});

test('milestones: 10 hours on the day the total passes 600 minutes', () => {
  const days = on(120, '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05');
  assert.equal(byId(milestones(days, goal, '2026-10-22')).hours10.reachedOn, '2026-10-05');
  const less = byId(milestones(days.slice(0, 4), goal, '2026-10-22')).hours10;
  assert.equal(less.reachedOn, null);
  assert.equal(less.have, 480);
  assert.equal(milestoneProgress(less), 0.8);
});

test('milestones: 4 weeks in a row with the goal met, on the day the 4th week\'s goal was met', () => {
  // Weeks from Monday 28-09, 05-10, 12-10, 19-10; Monday to Wednesday, 15 minutes each.
  const days = ['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19'].flatMap((mon) => on(15, mon, addDay(mon, 1), addDay(mon, 2)));
  const m = byId(milestones(days, goal, '2026-10-22'));
  assert.equal(m.weeks4.have, 4);
  assert.equal(m.weeks4.reachedOn, '2026-10-21');
});

test('milestones: a week below the goal ends the run; this week does not end it before it is over', () => {
  const week = (mon) => on(15, mon, addDay(mon, 1), addDay(mon, 2));
  const days = [...week('2026-09-21'), ...week('2026-09-28'), ...on(15, '2026-10-05'), ...week('2026-10-12')];
  // Thursday 15-10 counts its week (met on Wednesday); the run before was broken by the week of 05-10.
  const m = byId(milestones(days, goal, '2026-10-22'));
  assert.equal(m.weeks4.have, 2);
  assert.equal(m.weeks4.reachedOn, null);
  // Today Monday 19-10, nothing yet this week: the best run is still 2.
  assert.equal(byId(milestones(days, goal, '2026-10-19')).weeks4.have, 2);
});

test('milestones: every day of one week, on its Sunday; practice after today is left out', () => {
  const full = on(5, '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18');
  const m = byId(milestones([...full, ...on(5, '2026-12-01')], goal, '2026-10-22'));
  assert.equal(m.fullWeek.reachedOn, '2026-10-18');
  assert.equal(m.fullWeek.have, 7);
  assert.equal(m.days7.have, 7);
});

test('milestones: the card shows the reached ones newest first and the two nearest next', () => {
  // Monday 05-10 to Sunday 11-10, an hour each day.
  const list = milestones(on(60, '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'), goal, '2026-10-22');
  const { reached, upcoming } = milestoneSummary(list);
  assert.deepEqual(reached.map((m) => m.id), ['days7', 'fullWeek', 'first']);
  assert.equal(upcoming.length, 2);
  // 7 of 10 hours, then 7 of 25 hours (0.28) before 1 of 4 weeks (0.25).
  assert.deepEqual(upcoming.map((m) => m.id), ['hours10', 'hours25']);
});

test('milestones: no points, no comparison: shown only in the practice panel (student and staff)', () => {
  const parts = src('components/practice-parts.tsx');
  assert.match(parts, /<MilestonesView items=\{milestones\(history\.days, history\.goal, todayLocal\(\)\)\} own=\{own\} \/>/);
  const en = locale('en').practiceExtras;
  assert.match(en.milestonesIntroOwn, /Only you and your teachers/);
  for (const text of Object.values(en)) assert.doesNotMatch(String(text), /\b(points?|rank|leaderboard|lost)\b/i);
});

/** 'YYYY-MM-DD' plus `n` days. */
function addDay(day, n) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------- how did it go (#494) and the staff list (#495)

test('how did it go: asked after Stop and save, optional with Skip, and on the typed-in form', () => {
  const screen = src('screens/practice-tools.tsx');
  assert.match(screen, /<FeelingPrompt key=\{asking\.id\} entryId=\{asking\.id\}/);
  assert.match(src('components/practice-feeling.tsx'), /practiceExtras\.feelingSkip/);
  assert.match(src('app/student/practice-log.tsx'), /<FeelingFields feeling=\{feeling\}/);
  // log_practice's id comes back for it.
  assert.match(src('data/practice.ts'), /Promise<\{ id: number \| null \} \| \{ errorKey: MessageKey \}>/);
});

test('how did it go: faces and chips are at least 44 px and labelled for screen readers', () => {
  const feeling = src('components/practice-feeling.tsx');
  assert.match(feeling, /minHeight: 76/);
  assert.match(feeling, /chip: \{\n    minHeight: 44/);
  assert.match(feeling, /accessibilityRole="radio"/);
  assert.match(feeling, /accessibilityRole="checkbox"/);
});

test('staff list: a week meets the goal with its days and, in all, its minutes', () => {
  assert.equal(weekGoalMet({ days: 4, minutes: 60, goal: { days: 4, minutes: 15 } }), true);
  assert.equal(weekGoalMet({ days: 4, minutes: 59, goal: { days: 4, minutes: 15 } }), false);
  assert.equal(weekGoalMet({ days: 3, minutes: 200, goal: { days: 4, minutes: 15 } }), false);
});

test('staff list: only for coordinators and the Guru, opened from Practice tools', () => {
  assert.match(src('screens/practice-tools.tsx'), /area === 'staff' && \(isGuru \|\| profile\?\.role === 'coordinator'\) \? \(\n\s+<Button variant="secondary" icon="students" label=\{t\('practiceExtras\.weekOpen'\)\}/);
  assert.match(src('app/staff/practice-week.tsx'), /fetchStaffPracticeWeek\(weeksAgo\)/);
});

test('every new string is in English, Telugu and Hindi', () => {
  const [en, te, hi] = ['en', 'te', 'hi'].map((l) => locale(l).practiceExtras);
  assert.deepEqual(Object.keys(te).sort(), Object.keys(en).sort());
  assert.deepEqual(Object.keys(hi).sort(), Object.keys(en).sort());
  for (const [k, v] of Object.entries(te)) assert.notEqual(v, en[k], `te ${k} is translated`);
});
