// Builds the native-speaker review sheet for Telugu and Hindi (audit phase 4 B4-9, docs/DECISIONS.md #335):
// docs/translation-review/te-hi-review.xlsx, one row per text with its key, English, Telugu, Hindi, what to
// check and the screens it shows on, plus a "Check first" sheet (the audit's flagged lines) and a "Terms"
// sheet (one thing named two ways). Run from app/ after the texts change:
//   node scripts/translation-review.mjs
// It reads only the repo (src/, docs/TRANSLATIONS.md); nothing is sent anywhere.

import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { zipSync, strToU8 } from 'fflate';

const app = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = join(app, '..');
// `--out <file>` writes elsewhere (the unit test does, so the committed sheet is not touched).
const outArg = process.argv.indexOf('--out');
const out = outArg > 0 ? process.argv[outArg + 1] : join(repo, 'docs', 'translation-review', 'te-hi-review.xlsx');

// ---------------------------------------------------------------- the texts

const load = (lang) => JSON.parse(readFileSync(join(app, 'src', 'i18n', 'locales', `${lang}.json`), 'utf8'));
const flat = (obj, prefix = '') =>
  Object.entries(obj).flatMap(([k, v]) => (v && typeof v === 'object' ? flat(v, `${prefix}${k}.`) : [[`${prefix}${k}`, String(v)]]));
const en = flat(load('en'));
const te = Object.fromEntries(flat(load('te')));
const hi = Object.fromEntries(flat(load('hi')));
const keys = en.map(([k]) => k);
const keySet = new Set(keys);

// ---------------------------------------------------------------- where each text is used

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !name.endsWith('.d.ts') ? [path] : [];
  });
}

/** Readable names of the screens people talk about (the rest are named from their file). */
const SCREEN_NAMES = {
  'app/sign-in.tsx': 'Sign in',
  'app/sign-up.tsx': 'Sign up',
  'app/forgot-password.tsx': 'Forgot password',
  'app/reset-password.tsx': 'New password',
  'app/pending.tsx': 'Waiting for the desk',
  'app/about-you.tsx': 'About you',
  'app/join-ishtagoshti.tsx': 'Join Ishtagoshti',
  'app/staff/register.tsx': 'Register a student (desk)',
  'app/staff/(tabs)/attendance.tsx': 'Mark attendance (Attendance tab)',
  'app/staff/here-now.tsx': 'Who is here now',
  'app/staff/(tabs)/students.tsx': 'Students tab',
  'app/staff/(tabs)/follow-up.tsx': 'Calls tab (follow-up)',
  'app/staff/(tabs)/announcements.tsx': 'News tab (staff)',
  'app/staff/announcements/[id].tsx': 'One announcement (staff)',
  'app/staff/students/[id].tsx': 'Student profile',
  'app/staff/qr-cards.tsx': 'Print QR cards',
  'app/staff/settings.tsx': "Guru's settings",
  'app/student/(tabs)/index.tsx': 'Student home',
  'app/student/(tabs)/my-qr.tsx': 'My QR',
  'app/student/(tabs)/announcements.tsx': 'News tab (student)',
  'screens/my-profile.tsx': 'My profile',
  'screens/guru-home.tsx': 'Guru home',
  'screens/coordinator-home.tsx': 'Coordinator home',
};

function screenOf(file) {
  const rel = relative(join(app, 'src'), file).replaceAll('\\', '/');
  if (SCREEN_NAMES[rel]) return SCREEN_NAMES[rel];
  if (rel.startsWith('components/')) return `shared part: ${rel.slice(11).replace(/\.(web\.)?tsx?$/, '')}`;
  if (rel.startsWith('data/')) return `server answer: ${rel.slice(5).replace(/\.ts$/, '')}`;
  if (rel.startsWith('lib/') || rel.startsWith('i18n/') || rel.startsWith('auth/') || rel.startsWith('theme/')) {
    return `app logic: ${rel.replace(/\.(web\.)?tsx?$/, '')}`;
  }
  return rel
    .replace(/^app\//, '')
    .replace(/^screens\//, '')
    .replace(/\(tabs\)\//, '')
    .replace(/\.(web\.)?tsx?$/, '')
    .replace(/\/index$/, '')
    .replace(/\[id\]/g, 'one item')
    .replaceAll('/', ' › ');
}

const usedIn = new Map(keys.map((k) => [k, new Set()]));
for (const file of sourceFiles(join(app, 'src'))) {
  if (file.includes(`${join('src', 'i18n', 'locales')}`)) continue;
  const text = readFileSync(file, 'utf8');
  const screen = screenOf(file);
  for (const m of text.matchAll(/['"]([a-zA-Z][\w]*(?:\.[\w]+)+)['"]/g)) {
    const key = m[1];
    if (keySet.has(key)) usedIn.get(key).add(screen);
    // A plural pair is asked for without its ending.
    for (const end of ['_one', '_other']) if (keySet.has(key + end)) usedIn.get(key + end).add(screen);
  }
  // Keys built from a code: t(`register.errors.${code}`) uses every key under the prefix.
  for (const m of text.matchAll(/`([a-zA-Z][\w]*(?:\.[\w]+)*)\.\$\{/g)) {
    const prefix = `${m[1]}.`;
    for (const key of keys) if (key.startsWith(prefix)) usedIn.get(key).add(screen);
  }
}

// ---------------------------------------------------------------- what to check

/** Notes from docs/TRANSLATIONS.md: each "- **Section** (…)" bullet's full keys and `x.*` prefixes. */
const notes = new Map();
{
  const md = readFileSync(join(repo, 'docs', 'TRANSLATIONS.md'), 'utf8');
  for (const bullet of md.split(/\n(?=- \*\*)/)) {
    const title = /^- \*\*([^*]+)\*\*/.exec(bullet)?.[1];
    if (!title) continue;
    for (const m of bullet.matchAll(/`([a-zA-Z][\w]*(?:\.[\w*]+)+)`/g)) {
      const ref = m[1];
      const matches = ref.endsWith('.*') ? keys.filter((k) => k.startsWith(ref.slice(0, -1))) : keySet.has(ref) ? [ref] : [];
      for (const key of matches) notes.set(key, [...(notes.get(key) ?? []), `TRANSLATIONS.md "${title}"`]);
    }
  }
}

const flags = new Map(); // key → [reason]
const flag = (key, reason) => keySet.has(key) && flags.set(key, [...(flags.get(key) ?? []), reason]);

// P1-01: Telugu says అనుమతి ("permission") where English says consent; the parent emails say సమ్మతి.
for (const [key, english] of en) {
  if (/consent/i.test(english) && te[key]?.includes('అనుమతి')) {
    flag(key, 'P1-01: Telugu uses అనుమతి ("permission") for "consent"; the parent emails use సమ్మతి. Pick one word for consent (audit suggests సమ్మతి); keep అనుమతి where English means permission.');
  }
}
// P1-02: changed in this round.
for (const key of ['attendance.scanIntro', 'qrCards.intro', 'qrCards.keepSafe', 'qrCards.sectionHint', 'qrCards.replaceAskBody']) {
  flag(key, 'P1-02 changed 13-10-2026: "My QR" (English) replaced by the tab\'s own name “నా QR” / “मेरा QR”. Check the sentence still reads well.');
}
// New in this round (drafts written by the developer).
for (const key of keys.filter((k) => k.startsWith('common.serverErrors.') || ['common.back', 'common.required', 'practice.tempoFaster', 'practice.tempoSlower'].includes(k))) {
  flag(key, 'New 13-10-2026 (developer draft): server refusals, the web back button, "required" for screen readers, tempo buttons.');
}
// Plural pairs whose Telugu or Hindi forms are still the same.
for (const key of keys.filter((k) => k.endsWith('_one'))) {
  const other = key.replace(/_one$/, '_other');
  const same = [te[key] === te[other] ? 'Telugu' : '', hi[key] === hi[other] ? 'Hindi' : ''].filter(Boolean);
  if (same.length) {
    flag(key, `Plural: the ${same.join(' and ')} singular is the same as the plural; write a singular where the language needs one.`);
    flag(other, `Plural pair of ${key}.`);
  }
}
// Hindi gendered first person on buttons (D8-10).
for (const [key] of en) if (/रहूँगा|रहूँगी|रहा\/रही/.test(hi[key] ?? '')) flag(key, 'D8-10: Hindi gendered form (रहूँगा/रहूँगी, रहा/रही); maybe a neutral wording.');

/** Keys no screen uses (audit P1-06): listed, but the reviewer may skip them. */
const UNUSED = new Set([
  'signUp.fullName', 'signUp.under18', 'home.greeting', 'home.student.thisWeek', 'home.student.unread',
  'home.student.allAnnouncements', 'home.staff.shortcuts', 'staff.markAttendance', 'progress.open',
  'admin.myReportsLine', 'ishtagoshti.readSloka', 'ishtagoshti.editorHint', 'events.home.title',
  'events.home.pollsToVote', 'suggestions.shortcutLine', 'duty.shortcutLine', 'igSubscribers.homeHint', 'igSubscribers.open',
]);

// ---------------------------------------------------------------- terms (audit P1-03)

// A word is matched as a regular expression: Hindi सेव (save) must not match सेवा (seva).
const has = (text, word) => new RegExp(word).test(text ?? '');
const count = (dict, word) => Object.values(dict).filter((v) => has(v, word)).length;
const keysWith = (dict, word) => keys.filter((k) => has(dict[k], word));
const shown = (word) => word.replace(/\(\?![^)]*\)/g, '');
/** Thing, language, the words used for it, and a suggestion where an earlier decision or the audit gives one. */
const TERMS = [
  ['the Guru ("facilitator")', 'te', ['గురువు', 'ఫెసిలిటేటర్']],
  ['the Guru ("facilitator")', 'hi', ['गुरु', 'फ़ैसिलिटेटर']],
  ['attendance', 'hi', ['हाज़िरी', 'उपस्थिति']],
  ['student', 'hi', ['विद्यार्थी', 'छात्र']],
  ['coordinator', 'te', ['కోఆర్డినేటర్', 'సమన్వయకర్త']],
  ['coordinator', 'hi', ['कोऑर्डिनेटर', 'समन्वयक']],
  ['announcement', 'hi', ['सूचना', 'घोषणा']],
  ['consent', 'te', ['అనుమతి', 'సమ్మతి'], 'సమ్మతి, as in the parent emails (audit P1-01); keep అనుమతి where English says permission or allow'],
  ['save', 'hi', ['सेव(?!ा)', 'सहेज']],
  ['again', 'te', ['మళ్ళీ', 'మళ్లీ']],
  ['class', 'te', ['తరగతి', 'క్లాస్']],
];
const termRows = TERMS.map(([concept, lang, words, suggestion = '']) => {
  const dict = lang === 'te' ? te : hi;
  const counts = words.map((w) => `${shown(w)} ${count(dict, w)}`).join(' · ');
  const fewer = words.reduce((a, b) => (count(dict, a) <= count(dict, b) ? a : b));
  const minority = keysWith(dict, fewer);
  return [concept, lang === 'te' ? 'Telugu' : 'Hindi', counts, suggestion, '', shown(fewer), minority.slice(0, 40).join(', ') + (minority.length > 40 ? ` … (+${minority.length - 40})` : '')];
});

// ---------------------------------------------------------------- rows

const header = ['Key', 'English', 'Telugu', 'Hindi', 'What to check', 'Screen(s)', 'Telugu: reviewer\'s fix', 'Hindi: reviewer\'s fix', 'Reviewer notes'];
const rowOf = (key) => {
  const english = en.find(([k]) => k === key)[1];
  const what = [
    ...(flags.get(key) ?? []),
    ...(UNUSED.has(key) ? ['Not shown anywhere at present: skip unless time allows.'] : []),
    ...(notes.get(key) ?? []).slice(0, 2),
    /{{\w+}}/.test(english) ? 'Keep every {{…}} placeholder exactly as written; the app fills it in.' : '',
  ].filter(Boolean);
  const screens = [...usedIn.get(key)].slice(0, 4).join('; ');
  return [key, english, te[key] ?? '', hi[key] ?? '', what.join('\n'), screens, '', '', ''];
};
const all = keys.map(rowOf);
const first = keys.filter((k) => flags.has(k)).map(rowOf);

const readMe = [
  ['Telugu and Hindi review, round 1'],
  [''],
  ['What this is: every text of the Mridanga Seva app in English, Telugu and Hindi. The Telugu and Hindi were written as drafts and have not been checked by a native speaker yet.'],
  ['How to review: start with the sheet "Check first", then "Terms" (one word per thing), then "All texts" as time allows. Write your corrected text in the "reviewer\'s fix" column; leave it empty when the draft is right.'],
  ['Keep: every {{name}}-style placeholder exactly as written, the app fills it in. "Mridanga Seva", "QR", email and file names stay as they are.'],
  ['Tone: polite (మీరు / आप), short and plain; buttons say what happens ("Save", "Check in"). Hindi: avoid a gendered "I" form where possible.'],
  ['Screen(s): where the text appears (a shared part shows on several screens; "server answer" = a message after saving).'],
  [`Generated ${new Date().toISOString().slice(0, 10)} from the app's language files by app/scripts/translation-review.mjs (${keys.length} texts, ${first.length} to check first).`],
];

// ---------------------------------------------------------------- a small xlsx writer

const xmlText = (s) =>
  String(s)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
const colName = (i) => (i < 26 ? String.fromCharCode(65 + i) : String.fromCharCode(64 + Math.floor(i / 26)) + String.fromCharCode(65 + (i % 26)));

function sheetXml(rows, widths, { headerRow = true } = {}) {
  const cols = widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
  const body = rows
    .map((row, r) => {
      const cells = row
        .map((v, c) => `<c r="${colName(c)}${r + 1}" t="inlineStr" s="${headerRow && r === 0 ? 1 : 2}"><is><t xml:space="preserve">${xmlText(v)}</t></is></c>`)
        .join('');
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join('');
  const pane = headerRow ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' : '';
  const filter = headerRow && rows.length > 1 ? `<autoFilter ref="A1:${colName(rows[0].length - 1)}${rows.length}"/>` : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${pane}<cols>${cols}</cols><sheetData>${body}</sheetData>${filter}</worksheet>`;
}

const sheets = [
  ['Read me', sheetXml(readMe, [140], { headerRow: false })],
  ['Check first', sheetXml([header, ...first], [34, 40, 40, 40, 60, 30, 40, 40, 30])],
  ['Terms', sheetXml([['Thing', 'Language', 'Words in use (texts each)', 'Suggestion', 'Word to keep (reviewer)', 'Less used word', 'Texts using the less used word'], ...termRows], [26, 10, 36, 40, 24, 18, 90])],
  ['All texts', sheetXml([header, ...all], [34, 40, 40, 40, 50, 30, 40, 40, 30])],
];

const files = {
  '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`,
  '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map(([name], i) => `<sheet name="${xmlText(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`,
  'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
  'xl/styles.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="3"><xf/><xf fontId="1" applyFont="1"><alignment wrapText="1" vertical="top"/></xf><xf applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
  ...Object.fromEntries(sheets.map(([, xml], i) => [`xl/worksheets/sheet${i + 1}.xml`, xml])),
};

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])), { level: 9, mtime: new Date('2026-01-01T00:00:00Z') }));
console.log(`${relative(repo, out)}: ${keys.length} texts, ${first.length} to check first, ${termRows.length} terms`);
