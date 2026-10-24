// Unit tests for saves that wait for the signal (docs/DECISIONS.md #593; audit 22-10-2026 fix 18): the list kept on
// the device (src/lib/offline-queue.ts), what may still be sent and how (a timer entry at Stop's minutes, an old one as
// typed practice, nothing of an earlier class day), the sending with a stand-in database (request ids reused, a resend
// saved once, a scan never toggling a student out, one "no connection" stopping the round), the sign-out clean-up, and
// where the screens queue and show the count. Run from app/: npm test.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import './stubs/register.mjs';

const queue = await import('../src/lib/offline-queue.ts');
const send = await import('../src/lib/offline-send.ts');

const src = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const locale = (lang) => JSON.parse(src(`i18n/locales/${lang}.json`));

const ME = 'profile-1';
const TODAY = '2026-10-24';
const NOW = Date.parse('2026-10-24T12:00:00Z');
const base = (id, extra) => ({ id, profileId: ME, at: '2026-10-24T11:00:00Z', day: TODAY, ...extra });
const practice = (id, practiceFields, extra = {}) => base(id, { kind: 'practice', practice: practiceFields, ...extra });

/**
 * A stand-in database: rpc answers from `answers[fn]` (a function of the args), the visits read from `inToday`.
 * Every call is recorded. log_practice behaves like the 0054 twin: the same request id returns the same row.
 */
function fakeDb({ answers = {}, inToday = [], offline = false } = {}) {
  const calls = [];
  const saved = new Map();
  const net = { data: null, error: { message: 'TypeError: Failed to fetch' } };
  const db = {
    calls,
    saved,
    rpc: async (fn, args) => {
      calls.push({ fn, args });
      if (offline) return net;
      if (fn === 'log_practice' && !answers.log_practice) {
        if (!saved.has(args.p_request_id)) saved.set(args.p_request_id, saved.size + 1);
        return { data: saved.get(args.p_request_id), error: null };
      }
      return answers[fn] ? answers[fn](args) : { data: null, error: null };
    },
    from: (table) => {
      calls.push({ fn: `from:${table}` });
      const chain = {
        select: () => chain,
        is: () => chain,
        gte: () => chain,
        then: (resolve) =>
          resolve(offline ? net : { data: inToday.map((token) => ({ student: { qr_token: token } })), error: null }),
      };
      return chain;
    },
  };
  globalThis.__testSupabase = db;
  return db;
}

function reset() {
  queue.forgetOfflineQueue();
  globalThis.__testSupabase = undefined;
}

test('the list: one copy per request id, oldest first, removed by id; nothing kept once empty', () => {
  reset();
  queue.enqueueSave(practice('a', { minutes: 10, source: 'manual' }));
  queue.enqueueSave(practice('b', { minutes: 20, source: 'manual' }));
  queue.enqueueSave(practice('a', { minutes: 15, source: 'manual' }));
  assert.deepEqual(queue.queuedSaves().map((item) => item.id), ['b', 'a']);
  assert.equal(queue.queuedSaves()[1].practice.minutes, 15, 'a second tap replaces the first copy');
  queue.removeSaves(['a', 'b']);
  assert.deepEqual(queue.queuedSaves(), []);
  assert.equal(globalThis.localStorage?.getItem?.('offlineQueue') ?? null, null, 'no empty list left on the device');
});

test('what can still be sent: a check-in only on its class day; practice within the log\'s 14 days', () => {
  const scan = base('s', { kind: 'scan', qrToken: 'x', location: null });
  assert.equal(queue.sendable(scan, NOW, TODAY), scan);
  assert.equal(queue.sendable(scan, NOW + 86_400_000, '2026-10-25'), null, 'yesterday\'s check-in would count today');

  const timer = practice('t', { minutes: 25, source: 'timer', startedAt: '2026-10-24T10:30:00Z', taalId: 3 });
  assert.equal(queue.sendable(timer, NOW, TODAY), timer, 'under 6 hours: sent as the timer entry it was');
  const late = queue.sendable(timer, Date.parse('2026-10-24T17:00:00Z'), TODAY);
  assert.deepEqual(late.practice, { minutes: 25, source: 'manual', practisedOn: TODAY, taalId: 3 },
    'later: the same minutes, typed for the day it was stopped (the database takes timer starts of 6 hours only)');
  assert.equal(queue.sendable(timer, NOW + 14 * 86_400_000, '2026-11-07'), null, 'older than the log accepts');

  const typed = practice('m', { minutes: 30, source: 'manual', practisedOn: '2026-10-20' });
  assert.equal(queue.sendable(typed, NOW, '2026-11-02').practice.practisedOn, '2026-10-20');
  assert.equal(queue.sendable(typed, NOW, '2026-11-03'), null);
});

test('sending practice: the entry\'s own request id, saved once however often it is sent; how it went follows', async () => {
  reset();
  const db = fakeDb();
  send.queuePractice(ME, 'req-1', { minutes: 25, source: 'timer', startedAt: new Date(Date.now() - 30 * 60_000).toISOString(), taalId: null, feeling: 3, practised: ['taal'] });
  await send.sendQueued(ME);
  await send.sendQueued(ME);
  const logs = db.calls.filter((call) => call.fn === 'log_practice');
  assert.equal(logs.length, 1, 'sent once, then gone from the list');
  assert.equal(logs[0].args.p_request_id, 'req-1');
  assert.equal(logs[0].args.p_minutes, 25, 'the minutes counted at Stop');
  assert.equal(logs[0].args.p_source, 'timer');
  assert.ok(!('feeling' in logs[0].args) && !('p_feeling' in logs[0].args));
  assert.deepEqual(db.calls.find((call) => call.fn === 'set_practice_feeling').args, { p_id: 1, p_feeling: 3, p_practised: ['taal'] });
  assert.deepEqual(queue.queuedSaves(), []);

  // The first try reached the server but its answer was lost: the resend gets the same row back.
  db.saved.clear();
  db.saved.set('req-2', 7);
  send.queuePractice(ME, 'req-2', { minutes: 10, source: 'manual', practisedOn: TODAY });
  await send.sendQueued(ME, NOW, TODAY);
  assert.equal(db.saved.size, 1, 'no second row');
});

test('no connection: the round stops at once and everything stays for the next try', async () => {
  reset();
  const db = fakeDb({ offline: true });
  send.queuePractice(ME, 'p1', { minutes: 5, source: 'manual', practisedOn: TODAY });
  send.queuePractice(ME, 'p2', { minutes: 6, source: 'manual', practisedOn: TODAY });
  await send.sendQueued(ME, NOW, TODAY);
  assert.equal(db.calls.length, 1, 'one failed call, not one per entry');
  assert.equal(queue.queuedSaves().length, 2);
  assert.equal(queue.sendReport(), null, 'nothing refused');
});

test('a refusal or a save too old leaves the list and is counted once for the notice', async () => {
  reset();
  fakeDb({ answers: { log_practice: () => ({ data: null, error: { message: 'day_full' } }) } });
  queue.enqueueSave(practice('r', { minutes: 5, source: 'manual', practisedOn: TODAY }));
  queue.enqueueSave(base('old', { kind: 'mark', studentId: 's1', action: 'in', location: null, day: '2026-10-23' }));
  await send.sendQueued(ME, NOW, TODAY);
  assert.deepEqual(queue.queuedSaves(), []);
  assert.deepEqual(queue.sendReport(), { refused: 1, tooOld: 1 });
  queue.clearReport();
  assert.equal(queue.sendReport(), null);
});

test('a scanned code is sent only when the student is not in today, so a resend never checks them out', async () => {
  reset();
  const db = fakeDb({ inToday: ['aaaa'], answers: { scan_qr: () => ({ data: { action: 'in', full_name: 'X', roll_no: '1', at: 'now' }, error: null }) } });
  send.queueCheckIn(ME, 'c1', { qrToken: 'AAAA' }, null);
  send.queueCheckIn(ME, 'c2', { qrToken: 'bbbb' }, { status: 'no_fix' });
  send.queueCheckIn(ME, 'c3', { qrToken: 'bbbb' }, null);
  await send.sendQueued(ME);
  const scans = db.calls.filter((call) => call.fn === 'scan_qr');
  assert.deepEqual(scans.map((call) => call.args.p_qr), ['bbbb'], 'in already: nothing sent; the same code twice: sent once');
  assert.deepEqual(scans[0].args.p_location, { status: 'no_fix' }, 'the position taken at the scan goes along');
  assert.equal(db.calls.filter((call) => call.fn === 'from:visits').length, 1, 'who is in is read once per round');
  assert.deepEqual(queue.queuedSaves(), []);
});

test('a tapped name is sent with its meaning; only the signed-in login\'s saves are sent', async () => {
  reset();
  const db = fakeDb({ answers: { mark_visit: () => ({ data: { action: 'already_in', full_name: 'X', roll_no: '1' }, error: null }) } });
  send.queueCheckIn(ME, 'm1', { studentId: 'st-1', action: 'in' }, { status: 'fix', lat: 17.4, lng: 78.4, accuracy: 10 });
  queue.enqueueSave({ ...base('other', { kind: 'mark', studentId: 'st-2', action: 'in', location: null }), profileId: 'someone-else' });
  await send.sendQueued(ME);
  const marks = db.calls.filter((call) => call.fn === 'mark_visit');
  assert.equal(marks.length, 1);
  assert.equal(marks[0].args.p_student, 'st-1');
  assert.equal(marks[0].args.p_action, 'in');
  assert.deepEqual(queue.queuedSaves().map((item) => item.id), ['other']);
});

test('sign-out deletes the waiting saves and the notice with the other traces', async () => {
  reset();
  queue.enqueueSave(practice('x', { minutes: 5, source: 'manual', note: 'my note' }));
  queue.addToReport({ refused: 1, tooOld: 0 });
  const traces = await import('../src/lib/device-traces.ts');
  globalThis.__testOS = 'web';
  await traces.clearDeviceTraces();
  assert.deepEqual(queue.queuedSaves(), []);
  assert.equal(queue.sendReport(), null);
  assert.match(src('lib/device-traces.ts'), /forgetOfflineQueue\(\);/);
});

test('the screens queue on "no connection" only, and show the count; the root layout sends', () => {
  const tools = src('screens/practice-tools.tsx');
  assert.match(tools, /saved\.errorKey === NETWORK\) \{[\s\S]*?queuePractice\(profileId, requestId\(\), entry\);\s*clearPracticeTimer\(\);/,
    'the timer stops at Stop and its minutes wait');
  assert.match(tools, /<QueuedNotice kind="practice" \/>/);
  const log = src('app/student/practice-log.tsx');
  assert.match(log, /saved\.errorKey === NETWORK && profileId\) \{[\s\S]*?queuePractice\(profileId, requestId\(\), \{ \.\.\.entry, feeling, practised \}\);/);
  const door = src('app/staff/(tabs)/attendance.tsx');
  assert.match(door, /scanned\.errorKey === NETWORK;\n\s+if \(queued && token && profile\) queueCheckIn\(profile\.id, newRequestId\(\), \{ qrToken: token \}/);
  assert.match(door, /marked\.errorKey === NETWORK;\n\s+if \(queued && profile\) queueCheckIn\(profile\.id, newRequestId\(\), \{ studentId: student\.id, action \}/);
  assert.match(door, /<QueuedNotice kind="door" \/>/);
  const layout = src('app/_layout.tsx');
  assert.match(layout, /useQueueSender\(signedIn \? profile\?\.id : undefined\);/);
  assert.equal(send.NETWORK, 'common.networkError');
});

test('the waiting count and its notes in en, te and hi, with one and many', () => {
  for (const lang of ['en', 'te', 'hi']) {
    const block = locale(lang).offlineQueue;
    for (const key of ['doorWaiting_one', 'doorWaiting_other', 'practiceWaiting_one', 'practiceWaiting_other', 'refused_one', 'refused_other', 'tooOld_one', 'tooOld_other']) {
      assert.match(block[key], /\{\{count\}\}/, `${lang} ${key}`);
    }
    for (const key of ['doorBody', 'doorQueuedTitle', 'doorQueuedBody', 'practiceBody', 'sendNow', 'notSavedTitle', 'close']) assert.ok(block[key], `${lang} ${key}`);
    assert.match(block.practiceQueued, /\{\{time\}\}/, lang);
    assert.ok(locale(lang).webArea.loadFailed, lang);
  }
});
