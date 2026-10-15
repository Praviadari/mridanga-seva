// Unit tests for the launch UI (docs/DECISIONS.md #350-#357, Praveen 14-10-2026): the staff side menu, eight
// circles per home, nothing removed (only moved), a home that does not scroll, the website look through the shared
// parts, the module colour of a screen, and the international names in en/te/hi; later tweaks (#358-#371) at the end.
// Run from app/: npm test.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { contrast, loadTokens, luminance, palette } from '../../design/tokens.mjs';

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

test('each staff home has eight circles, none repeating a tab, the Guru and the coordinator their own', () => {
  const ring = fnText(shortcuts, 'StaffModules');
  const [guru, coordinator] = ring.split(/\n\s+: \[/);
  const count = (text) => (text.match(/key: '|shared\.\w+,|\bregister,/g) ?? []).length;
  assert.equal(count(guru.slice(guru.indexOf('guru\n'))), 8, 'Guru ring');
  assert.equal(count(coordinator.slice(0, coordinator.indexOf(']'))), 8, 'coordinator ring');
  // No second row of small circles any more (#241's rows went to the side menu).
  assert.doesNotMatch(ring, /more=/);
  // No circle repeats a bottom tab, and the home has no second Check-in (Praveen 14-10-2026).
  for (const tab of ['/staff/follow-up', '/staff/follow-ups-by-coordinator', '/staff/attendance', '/staff/students', '/staff/announcements']) {
    assert.ok(!ring.includes(`'${tab}'`), `ring repeats ${tab}`);
  }
  assert.doesNotMatch(today, /<Button/);
  // The middle Today box is a number only: Overview is a circle, Check-in a tab.
  assert.doesNotMatch(today, /href: '\/staff\/(overview|mark-attendance)'/);
  assert.match(fnText(shortcuts, 'staffMenuGroups'), /href: '\/staff\/follow-ups-by-coordinator'/);
});

test('the side menu never opens a tab screen as a second copy (R4-01) and lists only stack screens', () => {
  const groups = fnText(shortcuts, 'staffMenuGroups');
  for (const tab of ['/staff/attendance', '/staff/students', '/staff/follow-up', '/staff/announcements', '/staff']) {
    assert.ok(!groups.includes(`'${tab}'`), `menu opens the tab ${tab}`);
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
  // The person's own card at the top opens My profile (#360), so the menu has no second My profile line.
  assert.match(menu, /openMyProfile\(\);/);
  assert.match(menu, /<Initials name=\{myName\} size=\{52\} onBand \/>/);
  assert.doesNotMatch(fnText(shortcuts, 'staffMenuGroups'), /'\/staff\/profile'/);
  for (const lang of ['en', 'te', 'hi']) assert.ok(get(locale(lang), 'menu.viewProfile'), `${lang} menu.viewProfile`);
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
    // "Did you know?" under the ring, as on the student home (Praveen 14-10-2026).
    assert.match(text, /<StaffModules [^\n]*\/>\n[^\n]*\n\s*<FactCard \/>/);
  }
  assert.match(src('app/student/(tabs)/index.tsx'), /<Screen wide compact/);
});

// ---------------------------------------------------------------- #352 #355 the website look

test('the band is the website night with gold; buttons are pills; cards have the website shadow and corners', () => {
  const band = src('components/saffron-band.tsx');
  assert.match(band, /stopColor=\{gold\}/);
  // The band is drawn down to its wave edge; the page shows under the wave (#371).
  assert.match(band, /<Path d=\{d\} fill=\{`url\(#\$\{id\}\)`\} \/>/, 'wave edge');
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
  // In class now is people: green since #368.
  assert.equal(moduleToneFor(['staff', 'here-now']), 'green');
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

// ---------------------------------------------------------------- #361 light or dark on My profile

test('My profile offers Same as phone / Light / Dark, remembered on this phone, and the theme follows it', async () => {
  const { appearanceFrom, isDarkFor, APPEARANCES } = await import('../src/lib/appearance.ts');
  assert.deepEqual([...APPEARANCES], ['system', 'light', 'dark']);
  assert.equal(appearanceFrom(null), 'system');
  assert.equal(appearanceFrom('dark'), 'dark');
  assert.equal(appearanceFrom('purple'), 'system');
  assert.equal(isDarkFor('system', 'dark'), true);
  assert.equal(isDarkFor('system', 'light'), false);
  assert.equal(isDarkFor('light', 'dark'), false);
  assert.equal(isDarkFor('dark', 'light'), true);
  assert.match(src('theme/use-theme.ts'), /isDarkFor\(useAppearance\(\), useColorScheme\(\)\)/);
  const store = src('theme/appearance.ts');
  assert.match(store, /Appearance\.setColorScheme\(choice === 'system' \? 'unspecified' : choice\)/);
  assert.match(store, /if \(choice === 'system'\) removeLocal\(KEY\)/);
  assert.match(src('screens/my-profile.tsx'), /<AppearancePicker \/>/);
  for (const lang of ['en', 'te', 'hi']) {
    for (const key of ['myProfile.appearance', 'myProfile.appearanceHint', 'myProfile.appearanceChoices.system', 'myProfile.appearanceChoices.light', 'myProfile.appearanceChoices.dark']) {
      assert.ok(get(locale(lang), key), `${lang} ${key}`);
    }
  }
});

// ---------------------------------------------------------------- #362 night-and-gold bars, calmer dark mode

test('inner header bars are night with a gold title and gold line; dark mode fills module circles', () => {
  const theme = src('theme/use-theme.ts');
  assert.match(theme, /headerStyle: \{ backgroundColor: colors\.bar \}/);
  assert.match(theme, /borderBottomColor: colors\.barLine/);
  assert.match(theme, /color: colors\.headerGold, fontFamily: titleFont/);
  const generated = src('theme/tokens.generated.ts');
  assert.match(generated, /bar: '#1B1E4B'/);
  assert.match(generated, /bar: '#22307A'/);
  assert.match(src('components/icon.tsx'), /tone && \(solid \|\| isDark\)/);
  assert.match(menu, /backgroundColor: colors\.bar \}/);
});

// ---------------------------------------------------------------- #363 UI audit fixes 1, 2, 4, 7

test('help paragraphs show their first sentence and "ⓘ More" (en, te, hi; abbreviations kept)', async () => {
  const { firstSentence } = await import('../src/lib/first-sentence.ts');
  assert.deepEqual(firstSentence('Every seva item is here with its label code. Open one to lend it or take it back.'), {
    first: 'Every seva item is here with its label code.',
    rest: 'Open one to lend it or take it back.',
  });
  // A short first sentence keeps the next one; a short rest is not hidden.
  assert.equal(firstSentence('Newest first. Tap a name to open the profile. Someone with no visits yet may need a call.').first, 'Newest first. Tap a name to open the profile.');
  assert.equal(firstSentence('Only the facilitator changes these lessons for the class. Thank you.').rest, '');
  assert.equal(firstSentence('Only the area of the student, e.g. Koti, not the full address. Never the house number.').first, 'Only the area of the student, e.g. Koti, not the full address.');
  assert.equal(firstSentence('विद्यार्थी ऐप में मेरा QR खोलें और कैमरे के सामने रखें। बाहर होने पर चेक-इन फिर भी सहेजा जाता है।').rest, 'बाहर होने पर चेक-इन फिर भी सहेजा जाता है।');
  assert.ok(firstSentence('విద్యార్థిని యాప్‌లో నా QR తెరవమని అడగండి. తరగతి బయట ఉంటే చెక్-ఇన్ గుర్తుపెట్టబడుతుంది.').rest.length > 0);
  // Section descriptions and screen intros use it; the More button is a real disclosure button.
  assert.match(src('components/section.tsx'), /<MoreText text=\{description\} \/>/);
  const more = src('components/more-text.tsx');
  assert.match(more, /accessibilityRole="button"/);
  assert.match(more, /aria-expanded=\{open\}/);
  for (const screen of ['app/staff/inventory/index.tsx', 'app/staff/levels/index.tsx', 'app/staff/assessments/index.tsx', 'app/staff/(tabs)/follow-up.tsx', 'app/staff/settings.tsx']) {
    assert.match(src(screen), /<ScreenIntro text=/, screen);
  }
  for (const lang of ['en', 'te', 'hi']) assert.ok(get(locale(lang), 'common.more') && get(locale(lang), 'common.less'), lang);
});

test('Check-in opens with one big Scan button; its answer sits under it; a name tap buzzes like a scan', () => {
  const screen = src('app/staff/(tabs)/attendance.tsx');
  const scan = screen.indexOf("<Button size=\"large\" icon=\"qr\" label={t('attendance.startScan')}");
  assert.ok(scan > 0 && scan < screen.indexOf("t('attendance.summary'"), 'Scan comes before the counts');
  assert.ok(!screen.includes("title={t('attendance.scanSection')}"), 'no repeated "Scan to check in" heading');
  assert.ok(screen.indexOf('{resultUnderRow ? null : outcomeNotice}') < screen.indexOf("t('attendance.summary'"));
  assert.match(screen, /setOutcome\(marked\);\n\s+\/\/[^\n]*\n\s+scanFeedback\(/);
});

test('success moments: the tick pops and the phone buzzes once; buttons and circles sink when pressed', () => {
  const notice = src('components/notice.tsx');
  assert.match(notice, /haptic = tone === 'success'/);
  assert.match(notice, /if \(haptic\) successFeedback\(\);/);
  assert.match(notice, /isReduceMotionEnabled/);
  assert.match(src('components/visit-result-notice.tsx'), /<Notice haptic=\{false\} tone=/);
  assert.match(src('components/button.tsx'), /pressed && !inactive && styles\.pressed/);
  assert.match(src('components/module-ring.tsx'), /scale: 0\.94/);
});

test('home boxes: one rule — a box that opens a list shows ›, the number-only box has none', () => {
  const chip = fnText(today, 'TodayChip');
  assert.match(chip, /if \(!href\)/);
  assert.match(chip.slice(chip.indexOf('<Pressable')), /<Icon name="chevron"/);
  assert.doesNotMatch(chip.slice(0, chip.indexOf('<Pressable')), /<Icon name="chevron"/);
});

// ---------------------------------------------------------------- #371 dark mode's night gradient behind every page

test('dark pages fade from a lighter navy at the top to the deepest night; light pages stay flat cream', () => {
  const tokens = loadTokens();
  const light = palette(tokens, 'light');
  const dark = palette(tokens, 'dark');
  assert.equal(light.bodyTop, light.background);
  assert.equal(light.bodyBottom, light.background);
  assert.equal(light.background, '#FBF5EC', 'light mode keeps L1 cream');
  assert.equal(dark.background, '#0E1130', 'the middle stop is the page colour of #358');
  assert.ok(luminance(dark.bodyTop) > luminance(dark.background), 'top lighter than the middle');
  assert.ok(luminance(dark.background) > luminance(dark.bodyBottom), 'foot darker than the middle');
  // A soft range, so a cheap screen shows no bands; cards keep their edge against the lightest stop.
  assert.ok(contrast(dark.bodyTop, dark.bodyBottom) < 1.5, 'gradient range too wide');
  assert.ok(contrast(dark.cardBorder, dark.bodyTop) >= 1.15, 'card edge lost at the top of the page');
  // Cards look raised everywhere: lighter than the lightest page stop, fields and sheets a step above them.
  assert.ok(luminance(dark.surface) > luminance(dark.bodyTop), 'cards sink into the top of the page');
  assert.ok(luminance(dark.surfaceRaised) > luminance(dark.surface), 'fields not above the cards');
  // bodyTop is the lightest stop, under light text: every colour checked on the page is checked on it too.
  for (const kind of ['text', 'nonText']) {
    const pairs = tokens.pairs[kind].map(([fg, bg]) => `${fg} on ${bg}`);
    for (const pair of pairs.filter((p) => p.endsWith(' on background'))) {
      assert.ok(pairs.includes(pair.replace(/background$/, 'bodyTop')), `${kind}: ${pair} has no bodyTop pair`);
    }
  }
});

test('every page draws the gradient behind its content in dark mode only, fixed, silent and untouchable', () => {
  const screen = src('components/screen.tsx');
  // The first thing inside the page frame, outside the scrolling content, so it stays put.
  assert.match(screen, /style=\{\[styles\.fill, \{ backgroundColor: colors\.background \}\]\}>\n(\s*\{\/\*[^\n]*\*\/\}\n)?\s*<PageBackdrop \/>\n\s*<FormScrollContext/);
  const backdrop = src('components/page-backdrop.tsx');
  assert.match(backdrop, /if \(!isDark\) return null;/);
  assert.match(backdrop, /pointerEvents="none"/);
  assert.match(backdrop, /aria-hidden/);
  assert.match(backdrop, /importantForAccessibility="no-hide-descendants"/);
  assert.match(backdrop, /x1="0" y1="0" x2="0" y2="1"/, 'vertical');
  const stops = [...backdrop.matchAll(/<Stop offset=\{?"?([\w.]+)"?\}? stopColor=\{colors\.(\w+)\} \/>/g)].map((m) => `${m[1]} ${m[2]}`);
  assert.deepEqual(stops, ['0 bodyTop', 'MIDDLE background', '1 bodyBottom']);
  assert.match(backdrop, /const MIDDLE = 0\.45;/);
  // Header bars, the tab bar and the side menu stay flat.
  assert.doesNotMatch(src('theme/use-theme.ts') + menu, /PageBackdrop|bodyTop/);
  // The home and sign-in band paints nothing under its wave: the page, flat or gradient, meets it with no seam.
  const band = src('components/saffron-band.tsx');
  assert.match(band, /backgroundColor: size \? 'transparent' : colors\.headerBottom/);
  assert.doesNotMatch(band, /colors\.background/);
});
