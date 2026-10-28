// After-launch design (audit phase 5, docs/DECISIONS.md #339-#343): My QR's line about today's visit, when the
// welcome card shows, the quick dates and times, the staff homes' one request, and the new texts in all three
// languages. Run from app/: npm test.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import './stubs/register.mjs';

const { doorStatus } = await import('../src/lib/door-status.ts');
const { daysBetween, welcomeDue, WELCOME_WITHIN_DAYS } = await import('../src/lib/welcome.ts');
const { announcementTimes, pollCloseTimes, eventDates } = await import('../src/lib/quick-times.ts');

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const locale = (lang) => JSON.parse(read(`src/i18n/locales/${lang}.json`));
const dayOf = (iso) => iso.slice(0, 10);

test('My QR: not checked in yet, checked in at, checked out today (#342)', () => {
  assert.deepEqual(doorStatus(false, null, '2026-10-20', dayOf), { kind: 'none' });
  assert.deepEqual(doorStatus(false, '2026-10-18T10:35:00Z', '2026-10-20', dayOf), { kind: 'none' });
  assert.deepEqual(doorStatus(true, '2026-10-20T10:35:00Z', '2026-10-20', dayOf), { kind: 'in', at: '2026-10-20T10:35:00Z' });
  assert.deepEqual(doorStatus(false, '2026-10-20T10:35:00Z', '2026-10-20', dayOf), { kind: 'out', at: '2026-10-20T10:35:00Z' });
  // A visit left open since yesterday still says "checked in": the coordinator closes it at the door.
  assert.equal(doorStatus(true, '2026-10-19T10:35:00Z', '2026-10-20', dayOf).kind, 'in');
});

test('the welcome shows once, only for a student who joined lately (#342)', () => {
  assert.equal(daysBetween('2026-10-01', '2026-10-31'), 30);
  assert.equal(welcomeDue(false, '2026-10-20', '2026-10-20'), true);
  assert.equal(welcomeDue(false, '2026-09-20', '2026-10-20'), true);
  assert.equal(WELCOME_WITHIN_DAYS, 30);
  assert.equal(welcomeDue(false, '2026-09-19', '2026-10-20'), false, 'joined 31 days ago: no welcome after an update');
  assert.equal(welcomeDue(true, '2026-10-20', '2026-10-20'), false, 'seen on this phone');
  assert.equal(welcomeDue(false, '2026-10-21', '2026-10-20'), false, 'a join date in the future is odd: no welcome');
});

test('quick times for an announcement: tonight only before 19:00, tomorrow, the next Sunday (#343)', () => {
  // Tue 20-10-2026.
  const tuesday = announcementTimes('2026-10-20', '16:10');
  assert.deepEqual(tuesday.map((c) => [c.key, c.date, c.time]), [
    ['tonight', '20-10-2026', '19:00'],
    ['tomorrow', '21-10-2026', '07:00'],
    ['sunday', '25-10-2026', '07:00'],
  ]);
  assert.deepEqual(announcementTimes('2026-10-20', '19:30').map((c) => c.key), ['tomorrow', 'sunday']);
  // Saturday: Sunday is tomorrow, so no separate Sunday button.
  assert.deepEqual(announcementTimes('2026-10-24', '10:00').map((c) => c.key), ['tonight', 'tomorrow']);
  // Sunday: the next Sunday is a week away.
  assert.equal(announcementTimes('2026-10-25', '10:00').find((c) => c.key === 'sunday').date, '01-11-2026');
});

test('quick times for a poll and an event (#343)', () => {
  assert.deepEqual(pollCloseTimes('2026-10-30').map((c) => [c.date, c.time]), [
    ['31-10-2026', '21:00'],
    ['02-11-2026', '21:00'],
    ['06-11-2026', '21:00'],
  ]);
  assert.deepEqual(eventDates('2026-10-20').map((c) => [c.key, c.date, c.time]), [
    ['thisSunday', '25-10-2026', undefined],
    ['nextSunday', '01-11-2026', undefined],
  ]);
  assert.deepEqual(eventDates('2026-10-25').map((c) => c.date), ['25-10-2026', '01-11-2026'], 'on a Sunday, this Sunday is today');
});

test('the staff homes load their numbers in one request, and fall back when 0050 has not run (#340)', () => {
  for (const screen of ['src/screens/coordinator-home.tsx', 'src/screens/guru-home.tsx']) {
    const text = read(screen);
    assert.match(text, /fetchStaffDashboard\(/, screen);
    assert.doesNotMatch(text, /fetchPromotionHome\(|fetchCoordinatorDashboard\(\)|fetchGuruDashboard\(\)/, `${screen} makes a second request`);
    // The facilitator's Today boxes are inside the Needs attention strip since #702.
    assert.match(text, /<StaffToday |<NeedsAttention /, screen);
  }
  const home = read('src/data/home.ts');
  assert.match(home, /rpc\('staff_dashboard'\)/);
  assert.match(home, /PGRST202/);
});

test('the attendance tab still opens the camera for ?scan= (#339; the home button left in the launch UI, #351)', () => {
  assert.match(read('src/app/staff/(tabs)/attendance.tsx'), /params\.scan !== seenScan[\s\S]{0,80}setCameraOpen\(true\)/);
});

test('My QR keeps the screen awake only while it is in view (#342)', () => {
  const text = read('src/app/student/my-qr.tsx');
  assert.match(text, /activateKeepAwakeAsync\(tag\)/);
  assert.match(text, /deactivateKeepAwake\(tag\)/);
  assert.match(text, /useFocusEffect\(/);
});

test('the new texts exist in English, Telugu and Hindi', () => {
  const keys = [
    'home.today.scan',
    'home.waiting.title',
    'home.waiting.nothing',
    'home.waiting.signups_other',
    'register.checkInNow',
    'myQr.statusIn',
    'welcome.title',
    'welcome.entryCard',
    'quickTime.inDays_other',
  ];
  for (const lang of ['en', 'te', 'hi']) {
    const json = locale(lang);
    for (const key of keys) {
      const value = key.split('.').reduce((node, part) => node?.[part], json);
      assert.equal(typeof value, 'string', `${lang} ${key}`);
    }
  }
});
