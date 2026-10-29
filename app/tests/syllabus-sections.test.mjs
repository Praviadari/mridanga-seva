// Unit tests for sections in the syllabus (docs/DECISIONS.md #773, migration 0072) and the class's guna 1/2/4/8
// (#774): grouping in teaching order, the screens' wiring, the strings in en/te/hi, and no guna 3 offered anywhere.
// Run from app/: npm test.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import './stubs/register.mjs';

const { sectionRuns, cleanSection, hasSections, sectionNames, SECTION_MAX } = await import('../src/lib/syllabus-sections.ts');
const { LAYAS, taalPattern } = await import('../src/lib/practice-pattern.ts');

const src = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const repo = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const locale = (lang) => JSON.parse(src(`i18n/locales/${lang}.json`));

const CORE = 'Section 1: Core Practice – Hand Practice, Mantras, Tāla, Mātrās';
const SEVA = 'Section 2: Temple Seva – Ārati Mantras, Kīrtana Mantras';
const item = (id, section) => ({ id, section });

test('a level without sections is one run, shown as before', () => {
  const runs = sectionRuns([item(1, null), item(2, null), item(3, '  ')]);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].section, null);
  assert.deepEqual(runs[0].items.map((i) => i.id), [1, 2, 3]);
  assert.equal(hasSections([item(1, null), item(2, ' ')]), false);
});

test('sections follow teaching order; the same text typed differently is one section', () => {
  const runs = sectionRuns([item(1, CORE), item(2, ` ${CORE.replace(' – ', '  –\n ')} `), item(3, SEVA), item(4, SEVA)]);
  assert.deepEqual(runs.map((r) => [r.section, r.items.map((i) => i.id)]), [[CORE, [1, 2]], [SEVA, [3, 4]]]);
  assert.equal(cleanSection('  a \n\t b  '), 'a b');
  assert.equal(cleanSection(''), null);
  assert.equal(cleanSection(undefined), null);
});

test('items out of order show their section twice, and items without one get their own run', () => {
  const runs = sectionRuns([item(1, CORE), item(2, SEVA), item(3, CORE), item(4, null)]);
  assert.deepEqual(runs.map((r) => r.section), [CORE, SEVA, CORE, null]);
  assert.equal(hasSections([item(1, null), item(2, SEVA)]), true);
  assert.deepEqual(sectionNames([item(1, CORE), item(2, SEVA), item(3, CORE), item(4, null)]), [CORE, SEVA]);
  assert.equal(SECTION_MAX, 100);
});

test('the lists group by section and the editor sends it', () => {
  for (const path of ['app/student/progress.tsx', 'app/staff/levels/[id].tsx']) {
    const s = src(path);
    assert.match(s, /sectionRuns\(/, path);
    assert.match(s, /<SyllabusSectionHeading section=\{run\.section\} \/>/, path);
  }
  assert.match(src('app/staff/syllabus/[id].tsx'), /<SyllabusSectionHeading/);
  const editor = src('data/syllabus-editor.ts');
  assert.match(editor, /select\('id, level_id, sort, title, description, section, retired_at'\)/);
  assert.match(editor, /section: cleanSection\(section\) \}/);
  assert.match(editor, /message === 'section_too_long'/);
  assert.match(src('data/syllabus.ts'), /select\('id, level_id, sort, title, description, section, retired_at'\)/);
  assert.match(src('app/staff/levels/item/[id].tsx'), /label=\{t\('syllabusEditor\.sectionLabel'\)\}/);
  assert.match(repo('supabase/migrations/0072_syllabus_sections.sql'), /raise exception 'section_too_long'/);
});

test('the section strings are there in en, te and hi', () => {
  for (const lang of ['en', 'te', 'hi']) {
    const l = locale(lang);
    for (const key of ['sectionLabel', 'sectionHint', 'sectionUse', 'sectionLine']) assert.ok(l.syllabusEditor[key], `${lang} ${key}`);
    assert.ok(l.syllabusEditor.errors.sectionTooLong, lang);
    assert.ok(l.syllabus.noSection, lang);
    assert.match(l.syllabusEditor.sectionHint, /\{\{max\}\}/, lang);
    assert.match(l.syllabusEditor.sectionUse, /\{\{section\}\}/, lang);
  }
});

test('#774: the layakari choices are the class\'s guna 1/2/4/8; aṭhgun plays 8 written beats a beat', () => {
  assert.deepEqual([...LAYAS], [1, 2, 4, 8]);
  const bols = ['te', 're', 'khe', 'ta'];
  const p = taalPattern(bols, 8);
  assert.equal(p.events.length, bols.length * 8);
  assert.equal(p.beats, 4);
  for (const lang of ['en', 'te', 'hi']) assert.doesNotMatch(locale(lang).practiceExtras.layaHint, /3/, lang);
});

test('#774: no guna 3 offered to the facilitator or in the TEST seed', () => {
  assert.match(src('screens/staff-playground/exercise-editor.tsx'), /const GUNAS: readonly number\[\] = \[1, 2, 4, 8\];/);
  const seed = repo('supabase/seed/playground_test.sql');
  assert.match(seed, /"gunaByLevel":\{"1":\[1,2\],"2":\[1,2,4\],"3":\[1,2,4,8\]\}/);
  assert.doesNotMatch(seed, /\{1,2,3,4,8\}/);
});
