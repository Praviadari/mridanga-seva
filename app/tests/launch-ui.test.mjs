// Unit tests for the launch UI (docs/DECISIONS.md #350-#357, Praveen 14-10-2026): the staff side menu, eight
// circles per home, nothing removed (only moved), a home that does not scroll, the website look through the shared
// parts, the module colour of a screen, and the international names in en/te/hi.
// Run from app/: npm test.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import './stubs/register.mjs';

const src = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const locale = (lang) => JSON.parse(src(`i18n/locales/${lang}.json`));
const get = (obj, key) => key.split('.').reduce((o, p) => o?.[p], obj);

const shortcuts = src('components/staff-shortcuts.tsx');
const today = src('components/staff-today.tsx');
const menu = src('components/side-menu.tsx');

/** The text of a top-level function in a source file, from its declaration to the next top-level one. */
function fnText(text, name) {
  const start = text.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `function ${name} not found`);
  const next = text.slice(start + 1).search(/\n(export )?function /);
  return next < 0 ? text.slice(start) : text.slice(start, start + 1 + next);
}

// ---------------------------------------------------------------- #350 side menu, #351 homes

test('every screen the old staff homes offered is still offered: a tab, a circle, a Today box or the side menu', () => {
  // The old ring and rows (#240, #241) and Running the class (admin-links.tsx), as of 7fb2a44.
  const old = [
    '/staff/overview', '/staff/follow-ups-by-coordinator', '/staff/promotion', '/staff/here-now', '/staff/new-joiners',
    '/staff/assessments', '/staff/events', '/staff/reports', '/staff/levels', '/staff/groups', '/staff/practice',
    '/staff/ishtagoshti', '/staff/inventory', '/staff/duty', '/staff/suggestions', '/staff/fund',
    '/staff/coordinators', '/staff/database', '/staff/settings', '/staff/centres', '/staff/audit-log', '/staff/options',
    '/staff/heard-about', '/staff/register', '/staff/profile', '/staff/notifications',
  ];
  const offered = shortcuts + today;
  for (const path of old) assert.ok(offered.includes(`'${path}'`), `${path} is offered nowhere`);
  // The bottom tabs stay: Home, Check-in, Students, Follow-ups, News.
  const tabs = src('app/staff/(tabs)/_layout.tsx');
  for (const name of ['index', 'attendance', 'students', 'follow-up', 'announcements']) assert.match(tabs, new RegExp(`name="${name}"`));
});

test('each staff home has eight circles, the Guru and the coordinator their own', () => {
  const ring = fnText(shortcuts, 'StaffModules');
  const [guru, coordinator] = ring.split(/\n\s+: \[/);
  const count = (text) => (text.match(/key: '|shared\.\w+,/g) ?? []).length;
  assert.equal(count(guru.slice(guru.indexOf('guru\n'))), 8, 'Guru ring');
  assert.equal(count(coordinator.slice(0, coordinator.indexOf(']'))), 8, 'coordinator ring');
  // No second row of small circles any more (#241's rows went to the side menu).
  assert.doesNotMatch(ring, /more=/);
});

test('the side menu never opens a tab screen as a second copy (R4-01) and lists only stack screens', () => {
  const groups = fnText(shortcuts, 'staffMenuGroups');
  for (const tab of ['/staff/attendance', '/staff/students', '/staff/follow-up', '/staff/announcements', "/staff'"]) {
    assert.ok(!groups.includes(`'${tab}`), `menu opens the tab ${tab}`);
  }
  assert.match(fnText(shortcuts, 'openMenuItem'), /router\.push\(item\.href\)/);
});

test('the side menu is reachable and closable for everyone: label, Back/Escape, modal focus, 48 dp rows', () => {
  assert.match(menu, /accessibilityLabel=\{t\('menu\.open'\)\}/);
  assert.match(menu, /accessibilityLabel=\{t\('menu\.close'\)\}/);
  // Android Back and the web's Escape both reach Modal's onRequestClose.
  assert.match(menu, /<Modal[^>]*onRequestClose=\{onClose\}/);
  assert.match(menu, /accessibilityViewIsModal/);
  assert.match(menu, /aria-modal/);
  // TalkBack is moved into the menu on open and back to the button on close.
  assert.match(menu, /sendAccessibilityEvent\(heading\.current, 'focus'\)/);
  assert.match(menu, /sendAccessibilityEvent\(target, 'focus'\)/);
  const minHeight = Number(/row: \{[^}]*minHeight: (\d+)/.exec(menu)?.[1]);
  assert.ok(minHeight >= 48, `menu rows ${minHeight} px`);
  // No drawer package: plain React Native, so it reaches installed phones as an update.
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.dependencies['@react-navigation/drawer'], undefined);
  // The menu button sits in the home band and in every tab's header bar.
  assert.match(src('components/home-header.tsx'), /<MenuButton place="band" \/>/);
  assert.match(src('app/staff/(tabs)/_layout.tsx'), /headerLeft: menuButton/);
});

test('the maha-mantra left the home band for the foot of the side menu (Praveen 14-10-2026)', () => {
  const header = src('components/home-header.tsx');
  assert.doesNotMatch(header, /mantraLine/);
  assert.match(menu, /t\('home\.mantraLine1'\)/);
  assert.match(menu, /t\('home\.mantraLine2'\)/);
});

test('Waiting for you is one amber Today box with the total, opening its own screen (the home does not scroll)', () => {
  assert.match(today, /href: '\/staff\/waiting'/);
  assert.match(fnText(today, 'waitingTotal'), /signupsWaiting \+ board\.callsDue \+ board\.promotions \+ board\.fundToApprove \+ board\.toReview \+ board\.suggestions/);
  assert.ok(existsSync(new URL('../src/app/staff/waiting.tsx', import.meta.url)));
  for (const home of ['screens/guru-home.tsx', 'screens/coordinator-home.tsx']) {
    const text = src(home);
    assert.doesNotMatch(text, /<WaitingForYou/, `${home} still lists the rows`);
    assert.match(text, /<Screen wide compact/);
    assert.match(text, /<HomeHeader menu /);
  }
  assert.match(src('app/student/(tabs)/index.tsx'), /<Screen wide compact/);
});

// ---------------------------------------------------------------- #352 #355 the website look

test('the band is the website night with gold; buttons are pills; cards have the website shadow and corners', () => {
  const band = src('components/saffron-band.tsx');
  assert.match(band, /stopColor=\{gold\}/);
  assert.match(band, /<Path d=\{d\} fill=\{edge\} \/>/, 'wave edge');
  assert.match(src('components/button.tsx'), /borderRadius: radii\.pill/);
  const theme = src('theme/use-theme.ts');
  assert.match(theme, /cardRadius = 14/);
  assert.match(theme, /0 8px 24px/);
  assert.match(theme, /small: \{ fontSize: 14/);
  assert.match(theme, /fontFamily: titleFont/);
  assert.match(src('components/section.tsx'), /borderTopColor: colors\.accent/);
  assert.match(src('components/empty-state.tsx'), /<LotusLine /);
  assert.match(src('components/module-ring.tsx'), /\n\s+solid\n/);
});

test("a screen takes its module's circle colour; homes, set-up and unknown screens stay saffron", async () => {
  const { moduleToneFor } = await import('../src/lib/module-tone.ts');
  assert.equal(moduleToneFor(['staff', 'inventory', 'stocktake']), 'teal');
  assert.equal(moduleToneFor(['staff', '(tabs)', 'students']), 'green');
  assert.equal(moduleToneFor(['staff', 'here-now']), 'teal');
  assert.equal(moduleToneFor(['student', 'progress']), 'purple');
  assert.equal(moduleToneFor(['staff', '(tabs)']), undefined);
  assert.equal(moduleToneFor(['staff', 'settings']), undefined);
  assert.equal(moduleToneFor(['sign-in']), undefined);
  // The ring colour and the module's screens agree.
  for (const [key, path] of [['instruments', 'inventory'], ['events', 'events'], ['assessments', 'assessments'], ['duty', 'duty']]) {
    const tone = new RegExp(`key: '${key}', icon: '[a-zA-Z]+', tone: '(\\w+)'`).exec(shortcuts)?.[1];
    assert.equal(moduleToneFor(['staff', path]), tone, key);
  }
  // The side menu lists every module, so its icons stay saffron.
  assert.match(menu, /<IconBadge name=\{item\.icon\} size=\{36\} plain \/>/);
});

// ---------------------------------------------------------------- #353 international names

test('the names members found confusing are renamed in English, and every new key exists in te and hi', () => {
  const en = locale('en');
  const expected = {
    'staff.hereNow': 'In class now',
    'home.today.hereNow': 'in class now',
    'home.modules.promotions': 'Level-ups',
    'home.modules.newJoiners': 'Newcomers',
    'staff.registerStudent': 'Welcome desk',
    'staff.markAttendance': 'Check-in',
    'tabs.attendance': 'Check-in',
    'tabs.calls': 'Follow-ups',
    'home.today.scan': 'Scan to check in',
    'home.waiting.title': 'To do',
    'duty.title': 'Seva roster',
    'auditLog.title': 'Change history',
    'options.title': 'Form choices',
    'database.title': 'All students',
    'syllabusEditor.module': 'Lessons',
    'promotion.nominate.title': 'Recommend for next level',
  };
  for (const [key, value] of Object.entries(expected)) assert.equal(get(en, key), value, key);
  for (const lang of ['te', 'hi']) {
    const other = locale(lang);
    for (const key of [...Object.keys(expected), 'menu.open', 'menu.close', 'menu.title', 'menu.groups.setup', 'home.today.waiting_other']) {
      const value = get(other, key);
      assert.ok(typeof value === 'string' && value.length > 0, `${lang} ${key}`);
      assert.notEqual(value, get(en, key), `${lang} ${key} is still English`);
    }
  }
  // No English screen title still uses the old words.
  const flat = [];
  const walk = (o) => Object.values(o).forEach((v) => (typeof v === 'object' ? walk(v) : flat.push(v)));
  walk(en);
  for (const old of ['Who is here now', 'Register a student', 'Duty roster', 'Audit log', 'Option lists', 'Running the class', 'Nominate for promotion']) {
    assert.ok(!flat.some((v) => v.includes(old)), `"${old}" is still in en.json`);
  }
});

test('icons: a group for In class now, a pie chart for Overview, a medal for Level-ups, the drum for Instruments', () => {
  const icon = src('components/icon.tsx');
  assert.match(icon, /hereNow: 'people-circle-outline'/);
  assert.match(icon, /status: 'pie-chart-outline'/);
  assert.match(icon, /promote: 'medal-outline'/);
  assert.match(icon, /if \(name === 'drum'\)/);
  assert.match(shortcuts, /key: 'instruments', icon: 'drum'/);
});
