// Unit tests for What's new (docs/DECISIONS.md #406): the bundled release notes, the helpers behind the screen and the
// dot, the profile's info icon, and the publish script's check that production has a dated entry of its own.
// Run from app/: npm test.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import './stubs/register.mjs';

const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
};

const lib = await import('../src/lib/whats-new.ts');
const { whatsNewProblems, codeChangedOn, NOTES_FILE } = await import('../scripts/lib/whats-new-check.mjs');

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const notes = JSON.parse(source('src/content/whats-new.json'));
const releases = notes.releases;

const release = (date, id, extra = {}) => ({
  version: '1.0.0',
  kind: 'update',
  id,
  date,
  notes: { en: ['a', 'b', 'c'], te: ['అ', 'ఆ', 'ఇ'], hi: ['अ', 'आ', 'इ'] },
  ...extra,
});

// ---- the notes file ------------------------------------------------------------------------

test('every release has a version, a kind, an 8-character id or none, and a real date or none', () => {
  assert.ok(releases.length >= 3);
  for (const r of releases) {
    const name = `${r.date} ${r.id}`;
    for (const key of Object.keys(r)) assert.ok(['version', 'kind', 'id', 'date', 'notes'].includes(key) || key.startsWith('_'), `${name}: ${key}`);
    assert.match(r.version, /^\d+\.\d+\.\d+$/, name);
    assert.ok(['installed', 'update'].includes(r.kind), name);
    assert.ok(r.id === null || /^[0-9a-f]{8}$/.test(r.id), name);
    if (r.date !== null) {
      assert.match(r.date, /^\d{4}-\d{2}-\d{2}$/, name);
      assert.equal(new Date(`${r.date}T00:00:00Z`).toISOString().slice(0, 10), r.date, `${name}: a real day`);
    }
  }
});

test('newest first: an unpublished entry only at the top, then the dates going back', () => {
  const dated = releases.filter((r) => r.date !== null);
  assert.ok(releases.findIndex((r) => r.date !== null) <= 1, 'at most one entry waits for the next update');
  assert.equal(releases.filter((r) => r.date === null).length, releases.findIndex((r) => r.date !== null));
  for (let i = 1; i < dated.length; i++) assert.ok(dated[i - 1].date >= dated[i].date, `${dated[i - 1].date} before ${dated[i].date}`);
});

test('3-8 plain lines per release, the same number in English, Telugu and Hindi, each in its own script', () => {
  for (const r of releases) {
    const name = `${r.date} ${r.id}`;
    assert.deepEqual(Object.keys(r.notes).sort(), ['en', 'hi', 'te'], name);
    const count = r.notes.en.length;
    assert.ok(count >= 3 && count <= 8, `${name}: ${count} lines`);
    for (const lang of ['te', 'hi']) assert.equal(r.notes[lang].length, count, `${name} ${lang}`);
    for (const lang of ['en', 'te', 'hi']) {
      assert.equal(new Set(r.notes[lang]).size, count, `${name} ${lang}: no line twice (lines are list keys)`);
      for (const line of r.notes[lang]) {
        assert.ok(line.trim().length > 10 && line.length <= 200, `${name} ${lang}: ${line}`);
        // Plain words for students: no decision numbers, migrations or audit codes.
        assert.doesNotMatch(line, /#\d|\b00\d\d\b|\bS\d-\d\d\b|\bLA-\d/, `${name} ${lang}: ${line}`);
      }
    }
    assert.ok(r.notes.te.every((line) => /[ఀ-౿]/.test(line)), `${name}: Telugu`);
    assert.ok(r.notes.hi.every((line) => /[ऀ-ॿ]/.test(line)), `${name}: Hindi`);
  }
});

test('the real history is there: the launch APK of 16-10-2026 and the update of 17-10-2026', () => {
  const apk = releases.find((r) => r.id === '90c6d1cd');
  assert.equal(apk?.kind, 'installed');
  assert.equal(apk?.date, '2026-10-16');
  const update = releases.find((r) => r.id === '01a14a74');
  assert.equal(update?.kind, 'update');
  assert.equal(update?.date, '2026-10-17');
  assert.match(update.notes.en.join(' '), /email/);
});

// ---- the helpers ---------------------------------------------------------------------------

test('the running release is the newest one with a date; a draft is never it', () => {
  const list = [release(null, null), release('2026-10-17', '01a14a74'), release('2026-10-16', '90c6d1cd')];
  assert.equal(lib.currentRelease(list), list[1]);
  assert.equal(lib.currentRelease([release(null, null)]), undefined);
  assert.equal(lib.currentRelease(releases)?.date !== null, true);
});

test('the notes come in the reader\'s language, English where a language has none', () => {
  const r = release('2026-10-17', null);
  assert.deepEqual(lib.releaseNotes(r, 'te'), r.notes.te);
  assert.deepEqual(lib.releaseNotes(r, 'hi'), r.notes.hi);
  assert.deepEqual(lib.releaseNotes(r, 'ta'), r.notes.en);
  assert.deepEqual(lib.releaseNotes({ ...r, notes: { ...r.notes, hi: [] } }, 'hi'), r.notes.en);
});

test('the dot: shown until What\'s new is opened, back after the next update, never for a draft alone', () => {
  store.clear();
  const old = [release('2026-10-17', '01a14a74')];
  assert.equal(lib.whatsNewUnseen(old), true, 'never opened on this device');
  lib.markWhatsNewSeen(old);
  assert.equal(store.get(lib.SEEN_KEY), '2026-10-17 01a14a74');
  assert.equal(lib.whatsNewUnseen(old), false);
  // A draft for the next update does not bring the dot back; publishing it (a date) does.
  assert.equal(lib.whatsNewUnseen([release(null, null), ...old]), false);
  assert.equal(lib.whatsNewUnseen([release('2026-10-25', null), ...old]), true);
  // The id is filled in a later update: the same release, but the key changes once, which only shows the dot again.
  assert.equal(lib.releaseKey(release('2026-10-25', null)), '2026-10-25');
  assert.equal(lib.whatsNewUnseen([]), false);
});

// ---- the screen and the icon ---------------------------------------------------------------

test('My profile has the info icon just above the version line, for students and staff', () => {
  const profile = source('src/screens/my-profile.tsx');
  const link = profile.indexOf('<WhatsNewLink');
  assert.ok(link > profile.indexOf('<SignOutButton') && link < profile.indexOf('<VersionLine />'));
  assert.match(profile, /<WhatsNewLink area=\{isStudent \? 'student' : 'staff'\} \/>/);
  for (const area of ['student', 'staff']) assert.match(source(`src/app/${area}/whats-new.tsx`), /<WhatsNewScreen \/>/);
});

test('the icon is a labelled button with a 44 px target that opens the area\'s own screen', () => {
  const link = source('src/components/whats-new-link.tsx');
  assert.match(link, /accessibilityRole="button"/);
  assert.match(link, /accessibilityLabel=\{unseen \? t\('whatsNew\.openNew'\) : t\('whatsNew\.open'\)\}/);
  assert.match(link, /minHeight: 44,/);
  assert.match(link, /minWidth: 44,/);
  assert.match(link, /<Icon name="info"/);
  assert.match(link, /'\/student\/whats-new' : '\/staff\/whats-new'/);
  // The dot is read again whenever My profile is back in front, so it goes after the notes were opened.
  assert.match(link, /useFocusEffect\(useCallback\(\(\) => setUnseen\(whatsNewUnseen\(RELEASES\)\)/);
  assert.match(source('src/screens/whats-new.tsx'), /markWhatsNewSeen\(RELEASES\)/);
});

// ---- the publish check ---------------------------------------------------------------------

test('publish check: a dated entry as new as the code passes; a draft, a _todo or an older entry is named', () => {
  const ok = { releases: [release('2026-10-25', null), release('2026-10-17', '01a14a74')] };
  assert.deepEqual(whatsNewProblems(ok, '2026-10-25'), []);
  assert.deepEqual(whatsNewProblems(ok, '2026-10-20'), []);
  assert.deepEqual(whatsNewProblems(ok, null), [], 'git could not tell: the date is not judged');
  const [stale] = whatsNewProblems({ releases: [release('2026-10-17', '01a14a74')] }, '2026-10-21');
  assert.match(stale, /is of 2026-10-17, but the app's code changed on 2026-10-21: add an entry/);
  const draft = whatsNewProblems({ releases: [release(null, null, { _todo: 'add Practice' }), ...ok.releases] }, '2026-10-21');
  assert.equal(draft.length, 2);
  assert.match(draft[0], /_todo: add Practice/);
  assert.match(draft[1], /no date/);
  assert.match(whatsNewProblems({ releases: [] }, null)[0], /has no release/);
  assert.match(whatsNewProblems(null, null)[0], /has no release/);
});

test('publish check: the code\'s day comes from git, leaving out the notes file itself', () => {
  let asked;
  const day = codeChangedOn((args) => {
    asked = args;
    return '2026-10-21\n';
  });
  assert.equal(day, '2026-10-21');
  assert.deepEqual(asked.slice(0, 3), ['log', '-1', '--format=%cs']);
  assert.ok(asked.includes('src') && asked.includes(`:(exclude)${NOTES_FILE}`));
  assert.equal(codeChangedOn(() => null), null);
  assert.equal(codeChangedOn(() => ''), null);
});

test('publish-update stops production on What\'s new, and only warns for preview and --check-only', () => {
  const script = source('scripts/publish-update.mjs');
  assert.match(script, /const notesProblems = whatsNewState\(\);/);
  assert.match(script, /if \(channel === 'production' && !checkOnly\) \{\n\s+fail\(`What's new/);
  // Checked before anything is built or uploaded.
  assert.ok(script.indexOf('whatsNewState()') < script.indexOf("'runtimeversion:resolve'"));
});
