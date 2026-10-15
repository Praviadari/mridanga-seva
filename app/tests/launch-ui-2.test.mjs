// Unit tests for the second round of UI audit fixes (UI_AUDIT_14-10-2026 fixes 5, 6, 8, 9; docs/DECISIONS.md #365
// onwards, Praveen 14-10-2026 "do remaining too to build world class"): light list rows, the Welcome desk in two steps,
// Telugu and Hindi serif headings, colour by family.
// Run from app/: npm test.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';

const src = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

/** The props of the first `<Tag` in a source text, up to its closing `/>`. */
function element(text, tag) {
  const start = text.indexOf(`<${tag}`);
  assert.ok(start >= 0, `<${tag} not found`);
  return text.slice(start, text.indexOf('/>', start));
}

// ---------------------------------------------------------------- #365 light list rows

test('Students, Follow-ups and Newcomers rows: the name and one line; the rest is on the profile or call screen', () => {
  const students = element(src('app/staff/(tabs)/students.tsx'), 'ListRow');
  assert.match(students, /details=\{\[lastVisitText\(t, student\)\]\}/);
  assert.match(students, /status: student\.status === 'active' \? undefined : student\.status/);
  assert.doesNotMatch(students, /rollNo|students\.mentor/);

  const followUp = element(src('app/staff/(tabs)/follow-up.tsx'), 'ListRow');
  assert.match(followUp, /details=\{\[entry\.task \? taskText\(entry\) : lastVisitText\(t, entry\.student\)\]\}/);
  assert.match(followUp, /chips=\{\{ status: entry\.student\.status \}\}/);
  assert.doesNotMatch(followUp, /rollNo/);

  const joiners = element(src('screens/coordinator-home.tsx').slice(src('screens/coordinator-home.tsx').indexOf('function NewJoinersList')), 'ListRow');
  assert.doesNotMatch(joiners, /rollNo|chips=/);
  assert.match(joiners, /details=\{\[t\('home\.staff\.joinedVisits'/);
});

test('announcement cards: one short meta line; "New" never on your own post; the rest on the announcement', () => {
  const staff = src('app/staff/(tabs)/announcements.tsx');
  const card = element(staff, 'AnnouncementCard');
  assert.match(card, /unread=\{!byMe && !a\.readByMe\}/);
  for (const moved of ['noLoginCount', 'postedBy', 'audienceName', 'files.count', 'announcements.edited']) {
    assert.ok(!card.includes(moved), `${moved} left the staff card`);
  }
  assert.match(card, /details=\{\[\n\s+\[/, 'one joined line');
  const detail = src('app/staff/announcements/[id].tsx');
  for (const kept of ['noLoginNote', 'postedBy', 'audienceName', 'announcements.edited']) assert.ok(detail.includes(kept), `${kept} on the detail`);

  const student = element(src('app/student/(tabs)/announcements.tsx'), 'AnnouncementCard');
  assert.ok(!student.includes('files.count') && !student.includes('audienceName') && !student.includes('announcements.edited'));
  assert.match(student, /\[formatDateTime\(a\.publishAt\), \.\.\.authorLine\(/);
});

// ---------------------------------------------------------------- #366 Welcome desk in two steps

test('Welcome desk: step 1 Who, Next checks it; step 2 More details with Save; the optional block folded', () => {
  const desk = src('app/staff/register.tsx');
  assert.match(desk, /const STEP_ONE: readonly \(keyof RegistrationForm\)\[\] = \['fullName', 'dob', 'phone', 'email'\];/);
  // Next checks only step 1's fields with the same rules as Save, then shows step 2.
  const next = desk.slice(desk.indexOf('function next()'), desk.indexOf('async function save()'));
  assert.match(next, /checkStudentDetails\(form\)/);
  assert.match(next, /focusFirst\(ORDER, problems\)/);
  assert.match(next, /setStep\(2\)/);
  // Save is unchanged at heart: every check, the same register call (the request id keeps a repeat single, #126).
  const save = desk.slice(desk.indexOf('async function save()'), desk.indexOf('function registerAnother()'));
  assert.match(save, /checkStudentDetails\(form\), \.\.\.\(minor \? checkGuardianConsent\(form\) : \{\}\)/);
  assert.match(save, /registerStudent\(form, serverMinor, adultNotice\)/);
  assert.match(save, /pendingFocus\.current = marks;\n\s+setStep\(1\);/);
  assert.match(save, /if \(inMore\) setMoreOpen\(true\);/);
  // One action per step: Next on step 1, Save on step 2.
  assert.match(desk, /step === 1 \? \(\n\s+<Button label=\{t\('register\.next'\)\} onPress=\{next\} \/>\n\s+\) : \(\n\s+<Button icon="register" label=\{t\('register\.submit'\)\}/);
  // The waiting list and Accept live on step 1 only; the parent's consent on step 2.
  assert.ok(desk.indexOf("{step === 1 ? (\n        <>\n          <ScreenIntro") > 0);
  assert.ok(desk.indexOf("title={t('register.waitingTitle'") < desk.indexOf("title={t('register.stepWho')}"));
  assert.ok(desk.indexOf("title={t('register.guardianSection')}") > desk.indexOf("title={t('register.stepMore')}"));
  assert.match(desk, /<Fold icon="about" title=\{t\('register\.moreTitle'\)\}[^>]*open=\{moreOpen\}/);
  // Android's Back on step 2 goes to step 1, only while the desk is in front.
  assert.match(desk, /useFocusEffect\(\n\s+useCallback\(\(\) => \{\n\s+if \(step !== 2 \|\| saved\) return undefined;\n\s+const subscription = BackHandler\.addEventListener/);
  const fold = src('components/fold.tsx');
  assert.match(fold, /accessibilityRole="button"/);
  assert.match(fold, /aria-expanded=\{open\}/);
  for (const lang of ['en', 'te', 'hi']) {
    const texts = JSON.parse(src(`i18n/locales/${lang}.json`));
    for (const key of ['stepWho', 'stepMore', 'next']) assert.ok(texts.register[key], `${lang} register.${key}`);
    assert.ok(texts.about.stepOf.includes('{{step}}') && texts.about.previous, lang);
  }
});
// ---------------------------------------------------------------- #367 Telugu and Hindi serif headings

test('Telugu and Hindi headings have their own serif: subset Noto Serif files with licences, small enough for an update', () => {
  const fonts = src('theme/fonts.tsx');
  for (const [lang, file] of [['te', 'NotoSerifTelugu-SemiBold'], ['hi', 'NotoSerifDevanagari-SemiBold']]) {
    assert.ok(fonts.includes(`${lang}: { family: '${file}', source: require('../../assets/fonts/${file}.ttf') }`), lang);
    const size = statSync(new URL(`../assets/fonts/${file}.ttf`, import.meta.url)).size;
    assert.ok(size < 190 * 1024, `${file}: ${size} bytes`);
  }
  for (const licence of ['OFL-noto-serif-telugu.txt', 'OFL-noto-serif-devanagari.txt']) {
    assert.match(readFileSync(new URL(`../assets/fonts/${licence}`, import.meta.url), 'utf8'), /SIL Open Font License/);
  }
  // Only the current language's font is loaded; a failure keeps the sans.
  assert.match(fonts, /const \{ family, source \} = HEADING_FONTS\[language\];/);
  assert.match(fonts, /\.catch\(\(\) => undefined\)/);
  assert.match(fonts, /\}, \[language\]\);/);
  // English keeps its larger serif sizes; Telugu and Hindi keep the sans sizes.
  assert.match(src('components/app-text.tsx'), /\.\.\.\(isLatinSerif\(serif\) \? serifType\[variant\] : null\)/);
  assert.match(src('theme/use-theme.ts'), /\.\.\.\(titleFont === serifFont \? \{ fontSize: 22 \} : null\)/);
});
// ---------------------------------------------------------------- #368 colour by family

test('module colours are five families; pink and indigo are gone; each ring keeps a family side by side', async () => {
  const { moduleToneFor, TONE_FAMILIES } = await import('../src/lib/module-tone.ts');
  assert.deepEqual([...TONE_FAMILIES], ['blue', 'green', 'purple', 'teal', 'orange']);
  const expect = {
    blue: ['overview', 'waiting', 'attendance', 'follow-up', 'follow-ups-by-coordinator', 'reports', 'visits'],
    green: ['register', 'new-joiners', 'students', 'here-now', 'groups'],
    purple: ['levels', 'assessments', 'promotion', 'syllabus'],
    teal: ['inventory', 'duty', 'fund', 'suggestions', 'practice'],
    orange: ['announcements', 'events', 'ishtagoshti'],
  };
  for (const [tone, routes] of Object.entries(expect)) {
    for (const route of routes) assert.equal(moduleToneFor(['staff', route]), tone, route);
  }
  for (const [route, tone] of [['my-qr', 'blue'], ['visits', 'blue'], ['progress', 'purple'], ['assessments', 'purple'],
    ['practice', 'teal'], ['announcements', 'orange'], ['events', 'orange'], ['about-you', 'green']]) {
    assert.equal(moduleToneFor(['student', route]), tone, `student ${route}`);
  }
  for (const file of ['lib/module-tone.ts', 'components/staff-shortcuts.tsx', 'app/student/(tabs)/index.tsx', 'screens/ishtagoshti-home.tsx']) {
    assert.doesNotMatch(src(file), /tone: '(pink|indigo)'|: '(pink|indigo)',/, file);
  }
  // A family's circles are side by side: the ring's colours, joined, never come back to a family left earlier.
  const tonesOf = (text) => [...text.matchAll(/tone: '(\w+)'/g)].map((m) => m[1]);
  const contiguous = (tones) => tones.every((tone, i) => i === 0 || tone === tones[i - 1] || !tones.slice(0, i).includes(tone));
  const student = src('app/student/(tabs)/index.tsx');
  const studentRing = tonesOf(student.slice(student.indexOf('const modules: Module[] = ['), student.indexOf('];', student.indexOf('const modules: Module[] = ['))));
  assert.deepEqual(studentRing, ['blue', 'blue', 'purple', 'purple', 'teal', 'orange', 'orange', 'green']);
  assert.ok(contiguous(studentRing));
  const shortcuts = src('components/staff-shortcuts.tsx');
  const shared = Object.fromEntries([...shortcuts.matchAll(/(\w+): \{ key: '\w+', icon: '\w+', tone: '(\w+)'/g)].map((m) => [m[1], m[2]]));
  shared.register = 'green';
  const ringText = shortcuts.slice(shortcuts.indexOf('const ring: Module[] = guru'), shortcuts.indexOf('return <ModuleRing'));
  const [guruText, coordinatorText] = ringText.split('\n    : [');
  const ringTones = (text) => [...text.matchAll(/shared\.(\w+)|^\s+(register),|tone: '(\w+)'/gm)].map((m) => (m[1] ? shared[m[1]] : m[2] ? 'green' : m[3]));
  assert.deepEqual(ringTones(guruText), ['blue', 'purple', 'purple', 'purple', 'orange', 'orange', 'green', 'green']);
  assert.deepEqual(ringTones(coordinatorText), ['green', 'green', 'teal', 'teal', 'purple', 'purple', 'orange', 'orange']);
});
// ---------------------------------------------------------------- #369 sign-in band in gold, #370 ring labels clear of the drum

test('the sign-in band shows the name and motto in gold, as the home band', () => {
  const header = src('components/brand.tsx');
  const band = header.slice(header.indexOf('export function BrandHeader'));
  assert.match(band, /t\('app\.name'\)/);
  assert.equal((band.match(/color: colors\.headerGold/g) ?? []).length, 2);
});

test('ring labels keep clear of the drum circle: the drum shrinks only as far as the labels need', async () => {
  const { ringLayout, ringAngle, CENTRE_GAP } = await import('../src/lib/ring-layout.ts');
  const base = { size: 343, side: 16, circle: 64, labelGap: 4, centreMax: 144, centreMin: 96 };
  const clear = (layout, labels) =>
    Math.min(...labels.map((label, i) => {
      const a = ringAngle(i, labels.length);
      const x = layout.radius * Math.cos(a);
      const top = layout.radius * Math.sin(a) + base.circle / 2 + base.labelGap;
      const dx = Math.max(x - label.width / 2, 0, -(x + label.width / 2));
      const dy = Math.max(top, 0, -(top + label.height));
      return Math.hypot(dx, dy) - layout.centre / 2;
    }));
  // The coordinator ring as measured on a 375 px phone, 15-10-2026.
  const coordinator = [92, 75, 76, 70, 80, 49, 89, 70].map((width) => ({ width, height: 20 }));
  const layout = ringLayout({ ...base, labels: coordinator });
  assert.ok(clear(layout, coordinator) >= CENTRE_GAP - 0.5, `${clear(layout, coordinator)} px`);
  assert.ok(layout.centre < 144 && layout.centre >= 120, `drum ${layout.centre}`);
  assert.ok(layout.height <= 373, `ring ${layout.height} px tall: the home must not scroll`);
  // A side label stays inside the screen.
  assert.ok(layout.radius + 89 / 2 <= 343 / 2 + 16, 'Events & polls inside the screen');
  // Short labels (Telugu or a ring of few) leave the drum at its usual size.
  const short = Array.from({ length: 8 }, () => ({ width: 30, height: 20 }));
  assert.equal(ringLayout({ ...base, labels: short }).centre, 144);
  // Very long two-line labels never shrink it below the minimum.
  const long = Array.from({ length: 8 }, () => ({ width: 120, height: 40 }));
  assert.equal(ringLayout({ ...base, labels: long }).centre, 96);
  // Measured on the phone, not fixed: the ring reports each label's size.
  const ring = src('components/module-ring.tsx');
  assert.match(ring, /onLabelSize=\{\(label\) => onLabelSize\(module\.key, label\)\}/);
  assert.match(ring, /measured\[module\.key\] \?\? guessLabel\(module\.label, labelWidth\)/);
});