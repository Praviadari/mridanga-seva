// Unit tests for the facilitator's eleven modules (docs/DECISIONS.md #700-#709; Facilitator SOP 360° review,
// 27-10-2026): the approved order, the ring of eight on Home and the three in the side menu (#777, #778), the module
// tree (every old way in moved to exactly one module, every row an existing screen), the role filter, the plain
// relabels, and no "Guru" in any en/te/hi user string.
// Run from app/: npm test.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import './stubs/register.mjs';

const src = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const locale = (lang) => JSON.parse(src(`i18n/locales/${lang}.json`));
const get = (obj, key) => key.split('.').reduce((o, p) => o?.[p], obj);
const tree = await import('../src/lib/facilitator-modules.ts');
const { FACILITATOR_MENU, FACILITATOR_MODULES, FACILITATOR_MODULE_KEYS, FACILITATOR_RING, facilitatorModule, moduleAllowed, moduleHrefs, visibleSections } = tree;

/** Every string of a locale with its key. */
function strings(obj, prefix = '', out = []) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out.push([key, v]);
    else strings(v, key, out);
  }
  return out;
}

test('the tree has the eleven modules in the approved order, with the approved English names', () => {
  const order = ['admin', 'coordinators', 'students', 'teaching', 'inventory', 'media', 'events', 'funds', 'reports', 'security', 'settings'];
  assert.deepEqual([...FACILITATOR_MODULE_KEYS], order);
  assert.deepEqual(FACILITATOR_MODULES.map((m) => m.key), order);
  const en = locale('en');
  assert.deepEqual(
    FACILITATOR_MODULES.map((m) => get(en, m.label)),
    ['Admin', 'Coordinators', 'Students', 'Teaching', 'Inventory', 'Media', 'Events & Seva', 'Funds', 'Reports', 'Security & Audits', 'Settings'],
  );
  // The facilitator sees all eleven.
  assert.equal(FACILITATOR_MODULES.filter((m) => moduleAllowed(m, 'guru')).length, 11);
  for (const lang of ['te', 'hi']) {
    for (const m of FACILITATOR_MODULES) {
      const value = get(locale(lang), m.label);
      assert.ok(typeof value === 'string' && value.length > 0, `${lang} ${m.label}`);
      assert.notEqual(value, get(en, m.label), `${lang} ${m.label} is still English`);
    }
  }
});

test('ring homes (#777): eight modules on the Home ring, the other three in the side menu, each module in one place', () => {
  // Praveen 30-10-2026, in this order from the top, clockwise.
  assert.deepEqual([...FACILITATOR_RING], ['teaching', 'coordinators', 'students', 'events', 'reports', 'funds', 'inventory', 'admin']);
  assert.deepEqual([...FACILITATOR_MENU], ['media', 'security', 'settings']);
  const both = [...FACILITATOR_RING, ...FACILITATOR_MENU];
  assert.equal(new Set(both).size, both.length, 'a module is on the ring and in the menu');
  assert.deepEqual([...both].sort(), [...FACILITATOR_MODULE_KEYS].sort(), 'a module is in neither');
  // Nothing on the ring is Coming soon; every ring module is the facilitator's to open.
  for (const key of FACILITATOR_RING) {
    const m = facilitatorModule(key);
    assert.ok(m && !m.soon && moduleAllowed(m, 'guru'), key);
  }
});

/** The text of a function in a source file, to the next top-level function. */
function fnBody(text, name) {
  const start = text.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `function ${name} not found`);
  const next = text.slice(start + 1).search(/\n(export )?function /);
  return next < 0 ? text.slice(start) : text.slice(start, start + 1 + next);
}

test('the facilitator Home: band and bell kept, the To do line, the ring of eight with counts, no grid or strip', () => {
  const home = src('screens/guru-home.tsx');
  assert.match(home, /<HomeHeader menu /);
  assert.match(home, /<ToDoLine board=\{board\} \/>/);
  assert.match(home, /<FacilitatorRing board=\{board\} \/>/);
  assert.doesNotMatch(home, /<StaffModules|<NeedsAttention|<FacilitatorModules|<StaffToday/);
  assert.ok(!existsSync(new URL('../src/components/facilitator-modules.tsx', import.meta.url)), 'the 11-circle grid is gone');
  assert.match(src('components/home-header.tsx'), /<InboxBell \/>/);
  // Each circle opens its landing screen; what waits behind it is a red count on it (Level-ups on Teaching, as before).
  const shortcuts = src('components/staff-shortcuts.tsx');
  const ring = fnBody(shortcuts, 'FacilitatorRing');
  assert.match(ring, /FACILITATOR_RING\.flatMap/);
  assert.match(ring, /router\.push\(\{ pathname: '\/staff\/modules\/\[key\]', params: \{ key \} \}\)/);
  const counts = fnBody(shortcuts, 'facilitatorRingCounts');
  assert.match(counts, /teaching: board\.promotions \+ board\.toReview \+ board\.suggestions,/);
  assert.match(counts, /coordinators: board\.callsDue,/);
  assert.match(counts, /students: board\.signupsWaiting,/);
  assert.match(counts, /funds: board\.fundToApprove,/);
});

test('a module not built yet (Media) is dimmed Coming soon in the side menu, not a button, with no fake screens', () => {
  const soon = FACILITATOR_MODULES.filter((m) => m.soon);
  assert.deepEqual(soon.map((m) => m.key), ['media']);
  assert.equal(soon[0].sections.length, 0);
  assert.match(fnBody(src('components/staff-shortcuts.tsx'), 'staffMenuGroups'), /soon: m\.soon,/);
  const menu = src('components/side-menu.tsx');
  const soonPart = menu.slice(menu.indexOf('if (item.soon) {'), menu.indexOf('const here = '));
  assert.doesNotMatch(soonPart, /Pressable|onPress/);
  assert.match(soonPart, /accessibilityState=\{\{ disabled: true \}\}/);
  assert.match(soonPart, /t\('comingSoon\.title'\)/);
  // Its address, typed by hand, says Coming soon and offers nothing.
  assert.match(src('app/staff/modules/[key].tsx'), /module\.soon \? \(\n\s+<Notice tone="info" title=\{t\('comingSoon\.title'\)\}>/);
});

test('every way in of the old facilitator Home, side menu and tabs is in exactly one module, at its old address', () => {
  const hrefs = moduleHrefs();
  assert.equal(new Set(hrefs).size, hrefs.length, 'an address is in two modules');
  // The old ring (#350), the old side menu (#350, #582, #587) and the bottom tabs; a tab is reached through the copy
  // that opens on top where there is one (R4-01): Check-in → mark-attendance, Students → class-list, Follow-ups → calls.
  const old = [
    '/staff/overview', '/staff/promotion', '/staff/assessments', '/staff/levels', '/staff/events', '/staff/ishtagoshti',
    '/staff/register', '/staff/new-joiners', '/staff/me', '/staff/follow-ups-by-coordinator', '/staff/groups', '/staff/duty',
    '/staff/inventory', '/staff/practice', '/staff/suggestions', '/staff/fund', '/staff/reports', '/staff/heard-about',
    '/staff/audit-log', '/staff/coordinators', '/staff/database', '/staff/centres', '/staff/settings', '/staff/options',
    '/staff/sign-in-codes', '/staff/app-errors', '/staff/notifications', '/staff/profile', '/staff/here-now',
    '/staff/mark-attendance', '/staff/class-list', '/staff/calls', '/staff/announcements',
  ];
  for (const path of old) assert.ok(hrefs.includes(path), `${path} is in no module`);
  // Each row opens a screen that exists (no new screens, no duplicates of tabs).
  for (const href of hrefs) {
    const rel = href.replace(/^\//, '');
    const candidates = [`app/${rel}.tsx`, `app/${rel}/index.tsx`, `app/staff/(tabs)/${rel.replace(/^staff\//, '')}.tsx`];
    assert.ok(candidates.some((c) => existsSync(new URL(`../src/${c}`, import.meta.url))), `${href} has no screen`);
  }
  // Tab screens with no copy on top are opened in the tabs, never pushed as a second copy.
  const tabs = FACILITATOR_MODULES.flatMap((m) => m.sections.flatMap((s) => s.rows)).filter((r) => r.tab).map((r) => r.href);
  assert.deepEqual(tabs.sort(), ['/staff/announcements', '/staff/ishtagoshti']);
  assert.match(src('app/staff/modules/[key].tsx'), /if \(row\.tab\) router\.navigate\(row\.href\);\n\s+else router\.push\(row\.href\);/);
  // The old Running the class list stays reachable from its own address only; nothing new duplicates it.
  for (const m of FACILITATOR_MODULES) assert.ok(m.soon || m.sections.length > 0, `${m.key} is empty`);
});

test('modules and rows are filtered by role and own record; the screens still check the role themselves', () => {
  const coordinatorSees = FACILITATOR_MODULES.filter((m) => moduleAllowed(m, 'coordinator')).map((m) => m.key);
  assert.deepEqual(coordinatorSees, ['students', 'teaching', 'inventory', 'media', 'events', 'funds', 'reports', 'settings']);
  assert.equal(FACILITATOR_MODULES.filter((m) => moduleAllowed(m, 'student')).length, 0);
  const students = facilitatorModule('students');
  const rowsFor = (role, own = false) => visibleSections(students, role, own).flatMap((s) => s.rows.map((r) => r.key));
  assert.ok(rowsFor('guru').includes('database') && rowsFor('guru').includes('import'));
  assert.ok(!rowsFor('coordinator').includes('database') && !rowsFor('coordinator').includes('import'));
  const settings = facilitatorModule('settings');
  const personal = (own) => visibleSections(settings, 'guru', own).find((s) => s.key === 'personal').rows.map((r) => r.key);
  assert.deepEqual(personal(false), ['profile', 'notifications']);
  assert.deepEqual(personal(true), ['profile', 'notifications', 'me']);
  assert.equal(facilitatorModule('nonsense'), undefined);
  // The landing screen says "facilitator only" to a login the module is not for; the guarded screens keep their own
  // checks (hiding is never the guard).
  assert.match(src('app/staff/modules/[key].tsx'), /if \(!moduleAllowed\(module, profile\?\.role\)\) return <GuruOnly title=\{title\} \/>;/);
  for (const screen of ['app/staff/data-requests/index.tsx', 'app/staff/database/import.tsx']) {
    assert.match(src(screen), /role !== 'guru'\) return <GuruOnly/, screen);
  }
});

test('every module, section and row name exists in en, te and hi', () => {
  const keys = new Set();
  for (const m of FACILITATOR_MODULES) {
    keys.add(m.label);
    for (const s of m.sections) {
      keys.add(s.title);
      for (const r of s.rows) keys.add(r.label);
    }
  }
  for (const key of ['facilitatorHome.soonBody', 'facilitatorHome.notFound', 'menu.groups.modules', 'menu.groups.today']) keys.add(key);
  for (const lang of ['en', 'te', 'hi']) {
    const dict = locale(lang);
    for (const key of keys) assert.ok(typeof get(dict, key) === 'string' && get(dict, key).length > 0, `${lang} ${key}`);
  }
});

test('the side menu: the facilitator gets the three modules not on the ring; a coordinator keeps the old groups', () => {
  const shortcuts = src('components/staff-shortcuts.tsx');
  const groups = fnBody(shortcuts, 'staffMenuGroups');
  assert.match(groups, /FACILITATOR_MENU\.flatMap\(\(key\) => facilitatorModule\(key\) \?\? \[\]\)/);
  assert.doesNotMatch(groups, /FACILITATOR_MODULES|FACILITATOR_RING/);
  assert.match(groups, /href: \{ pathname: '\/staff\/modules\/\[key\]', params: \{ key: m\.key \} \}/);
  // The coordinator's ring and menu are as before (#350, #351).
  for (const path of ['/staff/overview', '/staff/groups', '/staff/promotion', '/staff/practice', '/staff/suggestions', '/staff/fund', '/staff/reports', '/staff/notifications']) {
    assert.ok(groups.includes(`'${path}'`), path);
  }
  assert.match(src('screens/coordinator-home.tsx'), /<StaffModules me=\{me\} board=\{board\} \/>/);
});

test('the spec\'s plain relabels (terminology map)', () => {
  const en = locale('en');
  const expected = {
    'admin.title': 'Administration',
    'menu.groups.setup': 'Administration',
    'fund.title': 'Funds',
    'auditLog.title': 'Audit History',
    'appErrors.title': 'App Diagnostics',
    'heardReport.title': 'Referral Sources',
    'staffCodes.title': 'Sign-in Security',
    'coordinators.makeCoordinator': 'Approve coordinator',
  };
  for (const [key, value] of Object.entries(expected)) assert.equal(get(en, key), value, key);
  assert.match(get(en, 'signInCode.lostBody'), /Security & Audits → Sign-in Security/);
  for (const lang of ['te', 'hi']) {
    for (const key of Object.keys(expected)) assert.notEqual(get(locale(lang), key), get(en, key), `${lang} ${key}`);
  }
});

test('no "Guru" in any English, Telugu or Hindi string the app shows (Thursday is not the role)', () => {
  // గురు / गुरु alone is also Thursday (గురువారం / गुरुवार): the weekday names keep it.
  const thursday = new Set(['duty.weekdays.4', 'coordinators.dutyPlaceholder']);
  const pattern = { en: /guru/i, te: /గురు/, hi: /गुरु(?!वार)/ };
  for (const lang of ['en', 'te', 'hi']) {
    const found = strings(locale(lang)).filter(([key, value]) => !thursday.has(key) && pattern[lang].test(value));
    assert.deepEqual(found, [], `${lang} still says Guru`);
  }
  // The facilitator in te/hi is the word the website and the translation glossary already used.
  assert.equal(get(locale('te'), 'roles.guru'), 'ఫెసిలిటేటర్');
  assert.equal(get(locale('hi'), 'roles.guru'), 'फ़ैसिलिटेटर');
  assert.doesNotMatch(src('content/whats-new.json'), /guru|గురు|गुरु/i);
  // The notice lines the database writes (0067) and the role's value stay apart: 'guru' is still the value.
  const sql = readFileSync(new URL('../../supabase/migrations/0067_facilitator_wording.sql', import.meta.url), 'utf8');
  const code = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  assert.doesNotMatch(code, /గురు|गुरु/);
});
