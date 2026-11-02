// Unit tests for the morning wake-up alarm and the khol notification sounds (docs/DECISIONS.md #791-#796, Praveen and
// Prji 02-11-2026): the alarm's rules (days, times, next ring, snooze), its channel and buttons, the background task,
// the sign-out clean-up, the two sounds in res/raw and the new announcement and reminder channels. Run from app/:
// npm test.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import './stubs/register.mjs';

const { DEFAULT_WAKE_ALARM, SNOOZE_CHOICES, WEEK_DAYS, alarmTime, isAlarmTime, nextRing, orderDays, parseSavedAlarm, snoozeUntil, triggerWeekday } =
  await import('../src/lib/wake-alarm-rules.ts');
const { isNoticeScreen } = await import('../src/data/notifications.ts');

const src = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const file = (path) => readFileSync(new URL(`../${path}`, import.meta.url));
const locale = (lang) => JSON.parse(src(`i18n/locales/${lang}.json`));

test('wake-up alarm: Monday first, every day at 05:00 with 10 minutes snooze until changed (#791)', () => {
  assert.deepEqual(WEEK_DAYS, [1, 2, 3, 4, 5, 6, 0]);
  assert.deepEqual(DEFAULT_WAKE_ALARM, { time: '05:00', days: [1, 2, 3, 4, 5, 6, 0], snooze: 10 });
  assert.deepEqual(SNOOZE_CHOICES, [5, 10, 15]);
  assert.equal(alarmTime(4, 5), '04:05');
  assert.ok(isAlarmTime('00:00') && isAlarmTime('23:59') && !isAlarmTime('24:00') && !isAlarmTime('5:00'));
  assert.deepEqual(orderDays([0, 3, 3, 1, 9]), [1, 3, 0], 'screen order, each once, nothing else');
});

test('wake-up alarm: kept per login; another login or a broken value reads as off', () => {
  const saved = JSON.stringify({ profileId: 'p1', time: '05:30', days: [0, 1], snooze: 5, url: '/student/practice' });
  assert.deepEqual(parseSavedAlarm(saved, 'p1'), { time: '05:30', days: [1, 0], snooze: 5 });
  assert.equal(parseSavedAlarm(saved, 'p2'), null);
  assert.equal(parseSavedAlarm('{', 'p1'), null);
  assert.equal(parseSavedAlarm(null, 'p1'), null);
  assert.equal(parseSavedAlarm(JSON.stringify({ profileId: 'p1', time: '25:00', days: [1], snooze: 5 }), 'p1'), null);
  assert.equal(parseSavedAlarm(JSON.stringify({ profileId: 'p1', time: '05:00', days: [], snooze: 5 }), 'p1'), null, 'no days = off');
  assert.equal(parseSavedAlarm(JSON.stringify({ profileId: 'p1', time: '05:00', days: [2], snooze: 7 }), 'p1').snooze, 10);
});

test('wake-up alarm: Android weekdays count 1 Sunday to 7 Saturday', () => {
  assert.deepEqual([0, 1, 6].map(triggerWeekday), [1, 2, 7]);
});

test('wake-up alarm: the next ring is later today, or the next chosen day', () => {
  // Monday 2 November 2026, 04:00 on the phone's clock.
  const monday4am = new Date(2026, 10, 2, 4, 0);
  assert.deepEqual(nextRing({ time: '05:00', days: [1], snooze: 10 }, monday4am), new Date(2026, 10, 2, 5, 0));
  // Past today's time: next Monday; Tuesday when chosen.
  const monday6am = new Date(2026, 10, 2, 6, 0);
  assert.deepEqual(nextRing({ time: '05:00', days: [1], snooze: 10 }, monday6am), new Date(2026, 10, 9, 5, 0));
  assert.deepEqual(nextRing({ time: '05:00', days: [1, 2], snooze: 10 }, monday6am), new Date(2026, 10, 3, 5, 0));
  assert.equal(nextRing({ time: '05:00', days: [], snooze: 10 }, monday6am), null);
});

test('wake-up alarm: snooze rings again after the chosen minutes, on the minute', () => {
  const now = new Date(2026, 10, 2, 5, 0, 40);
  assert.deepEqual(snoozeUntil(now, 10), new Date(2026, 10, 2, 5, 10, 0));
  assert.ok(snoozeUntil(new Date(2026, 10, 2, 5, 0, 0), 5) > new Date(2026, 10, 2, 5, 0, 0));
});

test('wake-up alarm: own channel with the khol at alarm volume, highest importance, Stop and Snooze buttons (#792)', () => {
  const alarm = src('lib/wake-alarm.ts');
  assert.match(alarm, /WAKE_CHANNEL_ID = 'wake-alarm-khol'/);
  assert.match(alarm, /sound: WAKE_SOUND/);
  assert.match(alarm, /WAKE_SOUND = 'khol_wake\.wav'/);
  assert.match(alarm, /usage: module\.AndroidAudioUsage\.ALARM/);
  assert.match(alarm, /importance: module\.AndroidImportance\.MAX/);
  assert.match(alarm, /SchedulableTriggerInputTypes\.WEEKLY/, 'repeats every week without the app');
  assert.match(alarm, /identifier: STOP_ACTION[^\n]*opensAppToForeground: false/);
  assert.match(alarm, /identifier: SNOOZE_ACTION[^\n]*opensAppToForeground: false/);
  assert.match(alarm, /registerTaskAsync\(WAKE_ALARM_TASK\)/);
  assert.match(alarm, /unregisterTaskAsync\(WAKE_ALARM_TASK\)/, 'no task (and no app start for each push) without an alarm');
  // A button opens no screen; only a tap does (lib/push.ts).
  assert.match(src('lib/push.ts'), /if \(response && response\.actionIdentifier !== DEFAULT_ACTION\) return null;/);
  // A tap opens the Practice tools of the area it was set in.
  for (const url of ['/student/practice', '/staff/practice', '/staff/me/practice', '/waiting/practice']) assert.ok(isNoticeScreen(url), url);
  assert.ok(!isNoticeScreen('/staff/practice-plan'));
});

test('wake-up alarm: the background task is defined before the app starts, the web version says it needs the app', () => {
  const entry = src('entry.ts');
  assert.ok(entry.indexOf("import './lib/wake-alarm-task';") >= 0);
  assert.ok(entry.indexOf("import './lib/wake-alarm-task';") < entry.indexOf("import 'expo-router/entry';"));
  const task = src('lib/wake-alarm-task.ts');
  assert.match(task, /TaskManager\.defineTask/);
  assert.match(task, /'actionIdentifier' in data/);
  assert.match(task, /await import\('\.\/wake-alarm'\)/, 'the work loads only when the task runs');
  assert.ok(!src('entry.web.tsx').includes('wake-alarm'));
  assert.match(src('lib/wake-alarm.web.ts'), /export const wakeAlarmPossible = false/);
  assert.match(src('components/wake-alarm-fold.tsx'), /t\('wakeAlarm\.appOnly'\)/);
  assert.match(src('screens/practice-tools.tsx'), /<WakeAlarmFold profileId=\{profileId\} url=\{PRACTICE_PATH\[area\]\} \/>/);
  assert.match(src('screens/practice-tools.tsx'), /void refreshWakeAlarm\(profileId\)/);
});

test('sign-out: the wake-up alarm goes with the other traces', async () => {
  assert.match(src('lib/device-traces.ts'), /forgetWakeAlarm\(\)/);
  const traces = await import('../src/lib/device-traces.ts');
  globalThis.__testOS = 'web';
  globalThis.__testCalls = [];
  await traces.clearDeviceTraces();
  assert.ok(globalThis.__testCalls.includes('wake-alarm'));
});

test('sounds: two khol WAVs in res/raw through the expo-notifications plugin, exact alarms asked for (#793, #795)', () => {
  const app = JSON.parse(file('app.json').toString('utf8')).expo;
  const plugin = app.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-notifications')[1];
  assert.deepEqual(plugin.sounds, ['./assets/sounds/notification/khol_wake.wav', './assets/sounds/notification/khol_notify.wav']);
  assert.equal(plugin.defaultChannel, 'announcements-khol');
  assert.ok(app.android.permissions.includes('android.permission.SCHEDULE_EXACT_ALARM'));
  assert.ok(!app.android.permissions.includes('android.permission.USE_EXACT_ALARM'));
  for (const [name, min, max] of [['khol_wake', 25, 30], ['khol_notify', 1, 2.5]]) {
    assert.match(name, /^[a-z0-9_]+$/, 'Android resource names: lowercase, digits, _');
    const wav = file(`assets/sounds/notification/${name}.wav`);
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
    assert.equal(wav.readUInt16LE(22), 1, 'mono');
    assert.equal(wav.readUInt32LE(24), 22050);
    assert.equal(wav.readUInt16LE(34), 16);
    const seconds = wav.readUInt32LE(40) / 2 / 22050;
    assert.ok(seconds >= min && seconds <= max, `${name}: ${seconds} s`);
  }
  assert.ok(file('assets/sounds/notification/khol_wake.wav').length < 1300 * 1024, 'the alarm sound stays under 1.3 MB');
  assert.match(file('scripts/make-khol-alarm-sounds.mjs').toString('utf8'), /assets\/sounds\/khol\//);
});

test('notification sounds: announcements and the practice reminder on new khol channels, old ones kept (#794)', () => {
  const push = src('lib/push.ts');
  assert.match(push, /const CHANNEL_ID = 'announcements-khol';/);
  assert.match(push, /NOTIFY_SOUND = 'khol_notify\.wav'/);
  assert.match(push, /renameOldChannel\(module, OLD_CHANNEL_ID/);
  assert.ok(!push.includes('deleteNotificationChannelAsync'), 'old channels are kept, never deleted');
  const reminder = src('lib/practice-reminder.ts');
  assert.match(reminder, /const CHANNEL_ID = 'practice-khol';/);
  assert.match(reminder, /sound: NOTIFY_SOUND/);
  const sender = readFileSync(new URL('../../supabase/functions/notify-announcements/messages.ts', import.meta.url), 'utf8');
  assert.match(sender, /export const CHANNEL_ID = 'announcements-khol';/, 'the sender uses the app channel id');
});

test('wake-up alarm: every text in English, Telugu and Hindi, with the same placeholders', () => {
  const en = locale('en').wakeAlarm;
  for (const lang of ['te', 'hi']) {
    const other = locale(lang).wakeAlarm;
    assert.deepEqual(Object.keys(other).sort(), Object.keys(en).sort(), lang);
    for (const [key, text] of Object.entries(en)) {
      const holes = (s) => (s.match(/\{\{\w+\}\}/g) ?? []).sort().join();
      assert.equal(holes(other[key]), holes(text), `${lang} ${key}`);
    }
    assert.ok(locale(lang).push.channelOldName && locale(lang).practice.reminderChannelOld, lang);
  }
  for (let d = 0; d < 7; d++) assert.ok(en[`dayLong${d}`] && locale('en').duty.weekdays[d]);
});
