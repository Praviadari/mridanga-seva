// Unit tests for more home practice (docs/DECISIONS.md #400-#402, Praveen 21-10-2026): the weekly goal and its weeks
// in a row, the speed trainer, the lead-in to sam, the cycle count the trainer runs on, the daily reminder's days, the
// screen kept on while the sound plays, the practice of the week on Practice tools, and the sign-out clean-up.
// The database side (0052) is in supabase/tests/smoke-test.mjs. Run from app/: npm test.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import './stubs/register.mjs';

const { DEFAULT_GOAL, goalWeek, goalWeeksInARow } = await import('../src/lib/practice-goal.ts');
const { bolPattern, countInClicks, cyclesPassed, cyclesToNextStep, taalSteps, trainerTempo } = await import('../src/lib/practice-pattern.ts');
const { beatHands, touchParts } = await import('../src/lib/hands.ts');
const handView = readFileSync(new URL('../src/components/hand-view.tsx', import.meta.url), 'utf8');
const { REMINDER_DAYS, REMINDER_TIMES, reminderDays } = await import('../src/lib/reminder-days.ts');

const src = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const locale = (lang) => JSON.parse(src(`i18n/locales/${lang}.json`));

const goal = { days: 3, minutes: 15 };
/** 15 minutes on each of these days. */
const on = (...days) => days.map((d) => ({ on: d, minutes: 15 }));

test('weekly goal: 4 days x 15 minutes unless the student or the teachers set another (#400)', () => {
  assert.deepEqual(DEFAULT_GOAL, { days: 4, minutes: 15 });
});

test('weekly goal: this week from Monday, a day counts with the minutes a day, less shows as some', () => {
  // Thursday 15-10-2026; Monday is 12-10.
  const week = goalWeek([{ on: '2026-10-12', minutes: 20 }, { on: '2026-10-13', minutes: 10 }, { on: '2026-10-15', minutes: 15 }], goal, '2026-10-15');
  assert.deepEqual(week.days.map((d) => d.on), ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18']);
  assert.deepEqual(week.days.map((d) => d.state), ['met', 'some', 'none', 'met', 'later', 'later', 'later']);
  assert.equal(week.met, 2);
  assert.equal(week.goalMet, false);
});

test('weekly goal: two entries on one day are added up', () => {
  const week = goalWeek([{ on: '2026-10-12', minutes: 10 }, { on: '2026-10-12', minutes: 5 }], goal, '2026-10-12');
  assert.equal(week.days[0].minutes, 15);
  assert.equal(week.days[0].state, 'met');
});

test('weeks in a row: counted back from last week while this week is not met yet, so a run is not broken mid-week', () => {
  const lastTwoWeeks = on('2026-10-05', '2026-10-06', '2026-10-07', '2026-09-28', '2026-09-29', '2026-09-30');
  assert.equal(goalWeeksInARow(lastTwoWeeks, goal, '2026-10-13'), 2); // nothing yet this week
  assert.equal(goalWeeksInARow([...lastTwoWeeks, ...on('2026-10-12', '2026-10-13', '2026-10-14')], goal, '2026-10-14'), 3);
  // A week with too few days ends the run.
  assert.equal(goalWeeksInARow([...on('2026-10-05', '2026-10-06', '2026-10-07'), ...on('2026-09-28'), ...on('2026-09-21', '2026-09-22', '2026-09-23')], goal, '2026-10-13'), 1);
  assert.equal(goalWeeksInARow([], goal, '2026-10-13'), 0);
  // Short days do not count towards the week.
  assert.equal(goalWeeksInARow([{ on: '2026-10-05', minutes: 14 }, ...on('2026-10-06', '2026-10-07')], goal, '2026-10-13'), 0);
});

test('weeks in a row: goalWeek reports it, and a met week says so', () => {
  const week = goalWeek(on('2026-10-12', '2026-10-13', '2026-10-14'), goal, '2026-10-14');
  assert.equal(week.goalMet, true);
  assert.equal(week.weeksInARow, 1);
});

test('speed trainer: one step per so many cycles, never past the top tempo (#400)', () => {
  const trainer = { target: 100, step: 5, every: 4 };
  assert.equal(trainerTempo(80, trainer, 0), 80);
  assert.equal(trainerTempo(80, trainer, 3), 80);
  assert.equal(trainerTempo(80, trainer, 4), 85);
  assert.equal(trainerTempo(80, trainer, 15), 95);
  assert.equal(trainerTempo(80, trainer, 16), 100);
  assert.equal(trainerTempo(80, trainer, 400), 100);
  assert.equal(trainerTempo(80, trainer, -1), 80, 'the lead-in (cycle -1 from sam) plays at the start tempo');
  assert.equal(trainerTempo(80, { ...trainer, target: 80 }, 40), 80, 'a top tempo at the start keeps it');
  assert.equal(trainerTempo(238, { target: 260, step: 5, every: 1 }, 2), 240, 'never past 240');
  assert.equal(cyclesToNextStep(80, trainer, 0), 4);
  assert.equal(cyclesToNextStep(80, trainer, 5), 3);
  assert.equal(cyclesToNextStep(80, trainer, 16), null, 'top tempo reached');
});

test('cycle count: the browser counts cycles, the phone loop starts again at 0 (a jump back of over half a cycle)', () => {
  assert.equal(cyclesPassed(null, { beat: 0.1, cycle: 0 }, 8), 0);
  assert.equal(cyclesPassed({ beat: 7.9, cycle: 0 }, { beat: 0.1, cycle: 1 }, 8), 1);
  assert.equal(cyclesPassed({ beat: 7.9, cycle: 0 }, { beat: 0.1, cycle: 3 }, 8), 3, 'a slow frame missed two');
  assert.equal(cyclesPassed({ beat: 7.9, cycle: 0 }, { beat: 0.1, cycle: 0 }, 8), 1, 'phone: the loop began again');
  assert.equal(cyclesPassed({ beat: 3.2, cycle: 0 }, { beat: 3.1, cycle: 0 }, 8), 0, 'a little back (a reload) is no cycle');
  assert.equal(cyclesPassed({ beat: 2, cycle: 0 }, { beat: 5, cycle: 0 }, 8), 0);
});

test('count-in: one bar of clicks, the metronome\'s bar or the taal\'s first vibhag, 2-8 (#403)', () => {
  assert.equal(countInClicks('metronome', 4, []), 4);
  assert.equal(countInClicks('metronome', 7, [8, 4, 4]), 7);
  assert.equal(countInClicks('taal', 4, [8, 4, 4]), 8);
  assert.equal(countInClicks('taal', 4, [3, 3]), 3);
  assert.equal(countInClicks('taal', 4, [16]), 8, 'at most 8');
  assert.equal(countInClicks('taal', 4, [1, 1]), 2, 'at least 2');
  assert.equal(countInClicks('taal', 4, []), 4);
});

test('step mode: the taal\'s strokes one by one, rests left out, with beat and place (#404)', () => {
  const steps = taalSteps(['dhā', '-', 'te.re', 'ka']);
  assert.deepEqual(steps.map((s) => [s.beat, s.part, s.bol.text]), [[0, 0, 'dhā'], [2, 0, 'te'], [2, 1, 're'], [3, 0, 'ka']]);
  const dha = bolPattern(steps[0].bol);
  assert.equal(dha.beats, 1);
  assert.deepEqual(dha.events.map((e) => e.sound).sort(), ['ga', 'ta'], 'both hands of dhā');
  const jha = bolPattern(taalSteps(['jhā'])[0].bol);
  assert.ok(jha.events[1].at > 0, 'jhā: the dayan stroke comes a little after');
});

test('hands: which parts of the hand touch for each kind of stroke (#404)', () => {
  assert.deepEqual(touchParts('index'), ['index']);
  assert.deepEqual(touchParts('middle'), ['middle']);
  assert.deepEqual(touchParts('threeFingers'), ['index', 'middle', 'ring']);
  assert.deepEqual(touchParts('fingers'), ['index', 'middle', 'ring', 'little']);
  assert.ok(touchParts('wristFingers').includes('heel') && !touchParts('wristFingers').includes('palm'));
  assert.ok(touchParts('flatHand').includes('palm') && touchParts('flatHand').includes('thumb'));
});

test('hands: left, right or both under each beat of the grid, from the bols (#404)', () => {
  assert.deepEqual(beatHands('tā'), ['right']);
  assert.deepEqual(beatHands('ka'), ['left']);
  assert.deepEqual(beatHands('dhā'), ['both']);
  assert.deepEqual(beatHands('te.re'), ['right', 'right']);
  assert.deepEqual(beatHands('-'), []);
  assert.deepEqual(beatHands('xyz'), ['unknown'], 'a bol the app does not know');
  assert.match(src('components/beat-grid.tsx'), /<AppText variant="small"[^>]*>\s*\{handsOf\(t, bol\) \|\| ' '\}/);
});

test('daily reminder: the next 14 days, today left out once practised (#402)', () => {
  assert.equal(REMINDER_DAYS, 14);
  const days = reminderDays('2026-10-21', false);
  assert.equal(days.length, 14);
  assert.equal(days[0], '2026-10-21');
  assert.equal(days[13], '2026-11-03');
  const after = reminderDays('2026-10-21', true);
  assert.equal(after.length, 13);
  assert.equal(after[0], '2026-10-22');
  assert.ok(REMINDER_TIMES.every((t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t)), 'times are 24-hour HH:MM');
});

test('daily reminder: one-off notifications on its own channel, a tap opens Practice tools, gone at sign-out', () => {
  const reminder = src('lib/practice-reminder.ts');
  assert.match(reminder, /SchedulableTriggerInputTypes\.DATE/);
  assert.ok(!reminder.includes('SchedulableTriggerInputTypes.DAILY'), 'no repeating trigger: today can be left out');
  assert.match(reminder, /url: '\/student\/practice'/);
  assert.match(reminder, /getPermissionsAsync/);
  assert.match(src('data/notifications.ts'), /url === '\/student\/practice'/);
  assert.match(src('lib/device-traces.ts'), /forgetPracticeReminders\(\)/);
  // The web version does nothing and says so on the screen.
  assert.match(src('lib/practice-reminder.web.ts'), /export const remindersPossible = false/);
  assert.match(src('components/practice-more.tsx'), /t\('practice\.reminderAppOnly'\)/);
});

test('sign-out: the practice reminder goes with the other traces', async () => {
  const traces = await import('../src/lib/device-traces.ts');
  globalThis.__testOS = 'web';
  globalThis.__testCalls = [];
  await traces.clearDeviceTraces();
  assert.ok(globalThis.__testCalls.includes('practice-reminder'));
});

test('Practice tools: screen on while playing, count-in on Start, plan above the tools, hands in the taal player', () => {
  const tools = src('screens/practice-tools.tsx');
  assert.match(tools, /activateKeepAwakeAsync\(tag\)/);
  assert.match(tools, /deactivateKeepAwake\(tag\)/);
  assert.match(tools, /player\.start\(pattern, bpm, countInFor\(mode, taal\)\)/);
  assert.ok(tools.indexOf('<PlanSection') < tools.indexOf('label={t(\'practice.tool\')}'), 'the practice of the week comes before the tool choice');
  assert.ok(tools.indexOf('<RecordMyself') < tools.indexOf('<GoalWeekView'), 'this week comes after the tools');
  // Record myself still starts its sound at once from beat 1 (its takes are compared with the sound from its start).
  assert.match(tools, /startFrom\(metronomePattern\(s\.beatsPerBar\), s\.bpm, null\)/);
  assert.match(tools, /found\.id, 0, s\.taalBpm\)/);
  // Both engines take the count-in and play one stroke.
  for (const engine of ['lib/practice-audio.ts', 'lib/practice-audio.web.ts']) {
    assert.match(src(engine), /async start\(pattern: Pattern, bpm: number, countIn = 0\)/, engine);
    assert.match(src(engine), /async playOnce\(pattern: Pattern, bpm: number\)/, engine);
  }
  assert.match(tools, /current=\{step \? step\.beat : head\?\.beat \?\? null\} hands \/>/);
  assert.match(src('components/two-head-view.tsx'), /<HandCard head="baya"[\s\S]*<HandCard head="dayan"/);
  // Stop after N: the stop runs from a timer, not inside the effect (react-hooks/set-state-in-effect).
  assert.match(tools, /cycles < stopAfter\) return;\s*const id = setTimeout/);
});

test('hands: the drawing follows lib/bols.ts only, and its colours work in dark mode', () => {
  assert.ok(!/KNOWN|readBol/.test(handView + src('lib/hands.ts')), 'no stroke mapping of its own');
  assert.match(handView, /fill=\{on \? HAND_LIT : colors\.surface\}/);
  assert.match(handView, /stroke=\{on \? HAND_LIT : colors\.textMuted\}/);
  assert.match(handView, /aria-hidden/);
});

test('mantra before practice: the reader\'s script first, only scripts the Guru wrote (#405)', async () => {
  const { firstScript, scriptsOf } = await import('../src/data/mantras.ts');
  const m = (text) => ({ id: 1, title: 'T', text: { devanagari: null, telugu: null, roman: null, ...text }, meaning: { en: null, te: null, hi: null }, source: null, sort: 0, active: true });
  const all = m({ devanagari: 'D', telugu: 'T', roman: 'R' });
  assert.deepEqual(scriptsOf(all), ['devanagari', 'telugu', 'roman']);
  assert.equal(firstScript(all, 'te'), 'telugu');
  assert.equal(firstScript(all, 'hi'), 'devanagari');
  assert.equal(firstScript(all, 'en'), 'roman');
  assert.equal(firstScript(m({ devanagari: 'D' }), 'te'), 'devanagari', 'falls back to a written script');
  assert.equal(firstScript(m({}), 'en'), null);
});

test('mantra before practice: no mantra text in the app or the migration, entry at the top, screen awake (#405)', () => {
  const sql = readFileSync(new URL('../../supabase/migrations/0052_practice_more.sql', import.meta.url), 'utf8');
  assert.ok(!/insert into practice_mantras/i.test(sql), 'nothing seeded: the text comes from the Guru');
  const tools = src('screens/practice-tools.tsx');
  assert.ok(tools.indexOf('<MantraEntry') < tools.indexOf('<PracticeTimerLine'), 'the mantra comes first on Practice tools');
  const reader = src('screens/mantra-reader.tsx');
  assert.match(reader, /activateKeepAwakeAsync\(tag\)/);
  assert.match(reader, /savedMantras\(\)/, 'the copy on the phone shows at once and offline');
  assert.match(src('data/mantras.ts'), /writeLocal\(SAVED_KEY/);
  // Students see nothing until a mantra exists; editors get "Add the mantra".
  const more = src('components/practice-more.tsx');
  assert.match(more, /if \(mantras\.length > 0\)[\s\S]*if \(area === 'staff' && canEdit\)[\s\S]*return null;/);
});

test('the new texts are in English, Telugu and Hindi, the reminder\'s too', () => {
  const keys = ['practice.goalDays', 'practice.goalToGo_other', 'practice.trainer', 'practice.countIn', 'practice.planTitle',
    'practice.reminderTitle', 'practice.reminderBody', 'practicePlan.title', 'practicePlan.errors.plan_bpm_invalid',
    'practice.cycleOf', 'practice.stoppedAfterCycles_other', 'practice.goalChange', 'practice.motionOpen', 'practice.motionClosed',
    'practice.handsLegend', 'practice.stepMode', 'practice.stepHear', 'mantras.entry', 'mantras.addFirst', 'mantras.scripts.telugu',
    'mantras.errors.mantra_text_required', 'mantras.pageDark'];
  for (const lang of ['en', 'te', 'hi']) {
    const json = locale(lang);
    for (const key of keys) {
      const value = key.split('.').reduce((o, p) => o?.[p], json);
      assert.ok(typeof value === 'string' && value.length > 0, `${lang} ${key}`);
    }
  }
});
