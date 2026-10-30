// Unit tests for the Rhythm Playground's switch (docs/DECISIONS.md #781): the settings playground_enabled and
// playground_pilot_group decide who sees the Playground (lib/playground-switch.ts), the answer is kept per login for an
// offline start (off when never read), and every way in follows it: the Practice card, the Daily Quest, the game
// routes, the staff Teaching row and student panel, the assessment form's game choice and the My data line.
// Run from app/: npm test.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';

import './stubs/register.mjs';

const src = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const sw = await import('../src/lib/playground-switch.ts');
const { PLAYGROUND_OFF, pilotGroupOf, playgroundOnFor, playgroundOnForStaff, playgroundOnForStudent, playgroundSwitch, loadPlaygroundSwitch, forgetPlaygroundSwitch } = sw;
const { facilitatorModule, visibleSections } = await import('../src/lib/facilitator-modules.ts');
const { readLocal } = await import('../src/lib/local-storage.ts');

const off = { enabled: false, pilotGroup: null, inPilot: false };
const allOn = { enabled: true, pilotGroup: null, inPilot: false };
const pilotIn = { enabled: true, pilotGroup: 7, inPilot: true };
const pilotOut = { enabled: true, pilotGroup: 7, inPilot: false };

test('students: off hides it, on shows it to all, a pilot group only to its members', () => {
  assert.equal(playgroundOnForStudent(off), false);
  assert.equal(playgroundOnForStudent(allOn), true);
  assert.equal(playgroundOnForStudent(pilotIn), true);
  assert.equal(playgroundOnForStudent(pilotOut), false);
  // A stale "in the pilot" while switched off still hides it.
  assert.equal(playgroundOnForStudent({ enabled: false, pilotGroup: 7, inPilot: true }), false);
  assert.deepEqual(PLAYGROUND_OFF, off);
});

test('staff: the Guru always (content before launch), a coordinator only while on, pilot group or not', () => {
  for (const s of [off, allOn, pilotIn, pilotOut]) assert.equal(playgroundOnForStaff(s, 'guru'), true);
  assert.equal(playgroundOnForStaff(off, 'coordinator'), false);
  assert.equal(playgroundOnForStaff(allOn, 'coordinator'), true);
  assert.equal(playgroundOnForStaff(pilotOut, 'coordinator'), true);
  assert.equal(playgroundOnForStaff(allOn, 'student'), false);
  assert.equal(playgroundOnFor(pilotOut, 'student'), false);
  assert.equal(playgroundOnFor(pilotIn, 'student'), true);
  for (const role of ['pending', undefined]) assert.equal(playgroundOnFor(allOn, role), false);
});

test('the pilot group setting: a positive whole number, anything else means every student', () => {
  assert.equal(pilotGroupOf(12), 12);
  assert.equal(pilotGroupOf('12'), 12);
  for (const v of [null, undefined, 'null', '', 0, -3, 1.5, 'abc', {}, true]) assert.equal(pilotGroupOf(v), null, String(v));
});

/** A fake client: settings rows, and the group_members rows the login may read. */
function fakeClient({ settings, members = [], fail = null }) {
  const calls = [];
  const query = (table) => {
    const q = { table, filters: {} };
    const chain = {
      select: () => chain,
      in: (col, vals) => ((q.filters[col] = vals), chain),
      eq: (col, val) => ((q.filters[col] = val), chain),
      limit: () => chain,
      then: (resolve, reject) => {
        calls.push(q);
        if (fail === table) return Promise.resolve({ data: null, error: { message: 'Failed to fetch' } }).then(resolve, reject);
        if (table === 'settings') return Promise.resolve({ data: settings, error: null }).then(resolve, reject);
        const rows = members.filter((m) => m.profile_id === q.filters.profile_id && m.group_id === q.filters.group_id && m.active);
        return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
      },
    };
    return chain;
  };
  return { from: query, calls };
}

test('loading: kept per login, a failure keeps the last answer, never read = off, sign-out forgets', async () => {
  forgetPlaygroundSwitch();
  assert.deepEqual(playgroundSwitch('me'), off);
  try {
    globalThis.__testSupabase = fakeClient({ settings: [{ key: 'playground_enabled', value: true }, { key: 'playground_pilot_group', value: null }] });
    await loadPlaygroundSwitch('me');
    assert.deepEqual(playgroundSwitch('me'), allOn);
    assert.deepEqual(playgroundSwitch('someone-else'), off, 'another login on this device starts off');
    // Kept on the device for the next start.
    assert.match(readLocal('playgroundSwitch'), /"profileId":"me"/);

    // A pilot group: only a member of the active group.
    const members = [{ profile_id: 'me', group_id: 7, active: true }, { profile_id: 'other', group_id: 7, active: false }];
    const client = fakeClient({ settings: [{ key: 'playground_enabled', value: true }, { key: 'playground_pilot_group', value: 7 }], members });
    globalThis.__testSupabase = client;
    await loadPlaygroundSwitch('me');
    assert.deepEqual(playgroundSwitch('me'), pilotIn);
    assert.deepEqual(client.calls.at(-1).filters, { profile_id: 'me', group_id: 7, 'groups.active': true });
    await loadPlaygroundSwitch('other');
    assert.deepEqual(playgroundSwitch('other'), pilotOut);

    // No internet: the last answer stays.
    globalThis.__testSupabase = fakeClient({ settings: null, fail: 'settings' });
    await loadPlaygroundSwitch('other');
    assert.deepEqual(playgroundSwitch('other'), pilotOut);

    // Off (as 0065 seeds it): the membership is not even asked.
    const offClient = fakeClient({ settings: [{ key: 'playground_enabled', value: false }, { key: 'playground_pilot_group', value: 7 }] });
    globalThis.__testSupabase = offClient;
    await loadPlaygroundSwitch('me');
    assert.deepEqual(playgroundSwitch('me'), { enabled: false, pilotGroup: 7, inPilot: false });
    assert.equal(offClient.calls.length, 1);

    // A database before 0065: no settings rows = off.
    globalThis.__testSupabase = fakeClient({ settings: [] });
    await loadPlaygroundSwitch('me');
    assert.equal(playgroundOnForStudent(playgroundSwitch('me')), false);
  } finally {
    delete globalThis.__testSupabase;
  }
  forgetPlaygroundSwitch();
  assert.deepEqual(playgroundSwitch('me'), off);
  assert.equal(readLocal('playgroundSwitch'), null);
  assert.match(src('lib/device-traces.ts'), /forgetPlaygroundSwitch\(\);/);
  assert.match(src('auth/auth-provider.tsx'), /void loadPlaygroundSwitch\(userId\);/);
});

test('the staff Teaching row: the Guru always, a coordinator only while on', () => {
  const teaching = facilitatorModule('teaching');
  const rows = (role, on) => visibleSections(teaching, role, false, on).flatMap((s) => s.rows.map((r) => r.key));
  for (const s of [off, allOn]) {
    assert.equal(rows('guru', playgroundOnFor(s, 'guru')).includes('playground'), true);
    assert.equal(rows('coordinator', playgroundOnFor(s, 'coordinator')).includes('playground'), s.enabled);
  }
  // The Practice section keeps its other row either way.
  assert.ok(rows('coordinator', false).includes('practice'));
  assert.match(src('app/staff/modules/[key].tsx'), /visibleSections\(module, profile\?\.role, ownRecord, playgroundOn\)/);
});

test('every Playground route sends back while off; the old tools fall back to their plain form', () => {
  const routes = [];
  const walk = (dir) => {
    for (const name of readdirSync(new URL(dir, import.meta.url))) {
      const path = `${dir}${name}`;
      if (statSync(new URL(path, import.meta.url)).isDirectory()) walk(`${path}/`);
      else routes.push(path);
    }
  };
  walk('../src/app/student/playground/');
  walk('../src/app/staff/playground/');
  assert.ok(routes.length >= 23);
  for (const path of routes) assert.match(readFileSync(new URL(path, import.meta.url), 'utf8'), /<PlaygroundOnly>/, path);
  const only = src('components/playground-only.tsx');
  assert.match(only, /'\/student\/my-practice'/);
  assert.match(only, /'\/staff\/modules\/teaching'/);
  assert.match(src('app/student/which-bol.tsx'), /usePlaygroundOn\(\) \? <SoundDetective \/> : <WhichBol \/>/);
  assert.match(src('app/student/tap-pad.tsx'), /<TapPad rounds=\{usePlaygroundOn\(\)\} \/>/);
  assert.match(src('app/student/echo-me.tsx'), /<EchoMe rounds=\{usePlaygroundOn\(\)\} \/>/);
});

test('the ways in follow the switch: Practice card, Daily Quest, staff student panel, assessment game choice', () => {
  assert.match(src('app/student/(tabs)/my-practice.tsx'), /\{playgroundOn \? <ShortcutTiles wide shortcuts=\{playground\} \/> : null\}/);
  const card = src('components/today-practice-card.tsx');
  assert.match(card, /if \(profile\?\.role !== 'student' \|\| !on\) return undefined;/);
  assert.match(card, /return on \? lines : null;/);
  assert.match(src('app/staff/students/[id].tsx'), /\{playgroundOn \? <PlaygroundPanel /);
  assert.match(src('screens/assessment-form.tsx'), /usePlaygroundSwitch\(myId\)\.enabled \|\| form\.playgroundGame !== null/);
  // The switch module stays free of Playground code: the student home and Practice tab load it first (#650).
  assert.doesNotMatch(src('lib/playground-switch.ts'), /from '\.\/playground|from '@\/(lib\/playground|screens|data\/playground)/);
  assert.doesNotMatch(src('components/playground-only.tsx'), /from '@\/(lib\/playground\/|lib\/playground-games|screens|data\/playground)/);
});

test('My data: the Playground line only when something is held', async () => {
  const { summarySections } = await import('../src/lib/my-data-page.ts');
  const t = (key) => key;
  const fmt = { date: (d) => d, dateTime: (d) => d };
  const base = { login: { full_name: 'A', email: 'a@x', language: 'en', role: 'student', created_at: '2026-10-01' }, devices: 0, notices: 0, replies: 0, event_answers: 0, poll_votes: 0, ishtagoshti: false, requests: [] };
  const lines = (playground) =>
    summarySections(t, { ...base, playground }, fmt).flatMap((s) => s.rows).filter((r) => r.label === 'dataRights.fields.playground');
  const none = { rounds: { count: 0, last: null }, weeks: [], ratings: [] };
  assert.equal(lines(none).length, 0);
  assert.equal(lines(undefined).length, 0);
  assert.equal(lines({ ...none, rounds: { count: 3, last: '2026-10-29T10:00:00Z' } }).length, 1);
  assert.equal(lines({ ...none, ratings: [{}] }).length, 1);
});
