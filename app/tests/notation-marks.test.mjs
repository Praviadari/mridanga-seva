// Unit tests for the class's C/O notation key (docs/NOTATION.md, agreed 02-11-2026; docs/DECISIONS.md #782-#784): the
// default mark per bol, the marks on Sound Detective's cards with the key, and the C/O marks in the syllabus seeds
// (no underline words, no lower-case l bars, LIVE file without TEST files).
// Run from app/: npm test.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import './stubs/register.mjs';

const { bolMark, beatMark, keyMarks } = await import('../src/lib/playground/marks.ts');

const src = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const repo = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const locale = (lang) => JSON.parse(src(`i18n/locales/${lang}.json`));

test('each Beginner bol has its default mark', () => {
  assert.equal(bolMark('te'), 'IIIIC');
  assert.equal(bolMark('ta'), 'IIIIO');
  assert.equal(bolMark('re'), '/');
  assert.equal(bolMark('khe'), '●');
  assert.equal(bolMark('ga'), 'O');
  assert.equal(bolMark('ge'), '▲');
  assert.equal(bolMark('dha'), null);
});

test('a beat runs its marks together as the team writes them; an unknown bol shows none', () => {
  assert.equal(beatMark('te.re'), 'IIIIC/');
  assert.equal(beatMark('khe.ta'), '●IIIIO');
  assert.equal(beatMark('-'), '–');
  assert.equal(beatMark('te.dha'), null);
  assert.equal(keyMarks('te.re khe ta'), 'IIIIC/ ● IIIIO');
  assert.equal(keyMarks('te dha'), null);
  assert.equal(keyMarks('-'), null);
});

test('marks use capital I only, never | or the digit 1', () => {
  for (const id of ['te', 'ta', 'jha', 'tak']) assert.doesNotMatch(bolMark(id), /[|1l]/);
});

test('Sound Detective cards show the mark and the key, in every language', () => {
  const sd = src('screens/playground/sound-detective.tsx');
  // #789: only for an exercise of the Beginner level (the exercise's level, not the bol alone).
  assert.match(sd, /exerciseMarks\(choice\.key, level\)/);
  assert.match(sd, /exercises\.find\(\(e\) => e\.id === challenge\.exerciseId\)\?\.levelId/);
  assert.match(sd, /playground\.sd\.marksKey/);
  assert.match(src('screens/staff-playground/bol-editor.tsx'), /staffPlayground\.bol\.mark/);
  for (const lang of ['en', 'te', 'hi']) {
    const l = locale(lang);
    for (const piece of ['C =', 'O =', 'I =']) assert.ok(l.playground.sd.marksKey.includes(piece), `${lang} marksKey has ${piece}`);
    assert.ok(l.staffPlayground.bol.mark.includes('{{mark}}'));
  }
});

test('the syllabus seeds carry the C/O marks, keep each document\'s finger count, and LIVE has no TEST files', () => {
  for (const file of ['supabase/seed/syllabus_beginner_test.sql', 'supabase/seed/syllabus_live.sql']) {
    const sql = repo(file);
    assert.match(sql, /1\. te IIIIC {2}2\. re \/ {2}3\. ta IIIIO/, `${file}: Beginner te/ta`);
    assert.match(sql, /ta – IO;  te – IIIC;  ri – IC;  ti – IIC/, `${file}: Intermediate key`);
    assert.match(sql, /ti – IIIC \(three fingers closed/, `${file}: Prabhupāda's ti`);
    assert.doesNotMatch(sql, /are underlined|lll|– l \(/, `${file}: no underline words or l bars`);
  }
  const live = repo('supabase/seed/syllabus_live.sql');
  assert.doesNotMatch(live, /insert into materials|storage\.objects|\.pdf'|update syllabus_items|delete from/);
  assert.match(live, /@example\.com/, 'LIVE file refuses the TEST project');
  // Same lesson list in both files (the LIVE file is copied from the TEST seed's step 2).
  const list = (sql) => sql.slice(sql.indexOf('for v_level, v_title, v_section, v_text in values'), sql.indexOf('  loop\n', sql.indexOf('for v_level')));
  assert.equal(list(live), list(repo('supabase/seed/syllabus_beginner_test.sql')));
});
