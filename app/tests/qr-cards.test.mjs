// Unit tests for src/lib/qr-card-sheet.ts: the printed QR cards for students without a phone
// (Phase 3 P3-1, docs/DECISIONS.md #249-#251). react-native is replaced by the stub in tests/stubs/.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import './stubs/register.mjs';

const { CARD, CARDS_PER_SHEET, cardPosition, cardSheetHtml, cardSheetsNeeded } = await import('../src/lib/qr-card-sheet.ts');
const { SHEET } = await import('../src/lib/label-sheet.ts');

const TEXTS = { brand: 'Mridanga Seva', cardTitle: 'Attendance card', logo: 'MS', footer: 'Show this card at the door.' };
const card = (n) => ({ qrText: `MS1:0F8FAD5B-D9CB-469F-A165-70867728950${n % 10}`, fullName: `Student <${n}>`, rollNo: `MS-2026-00${n}`, centreName: 'Abids' });

test('ten bank-card size cards fit on A4, centred', () => {
  assert.equal(CARDS_PER_SHEET, 10);
  const last = cardPosition(CARDS_PER_SHEET - 1);
  assert.ok(Math.abs(CARD.left - (SHEET.pageWidth - last.x - CARD.width)) < 0.01, 'left and right margins equal');
  assert.ok(Math.abs(CARD.top - (SHEET.pageHeight - last.y - CARD.height)) < 0.01, 'top and bottom margins equal');
  assert.ok(CARD.left >= 5 && CARD.top >= 5, 'at least 5 mm from the paper edge for most printers');
});

test('sheets needed', () => {
  assert.equal(cardSheetsNeeded(0), 0);
  assert.equal(cardSheetsNeeded(10), 1);
  assert.equal(cardSheetsNeeded(11), 2);
});

test('each card holds its QR, name (escaped), roll number and centre; 11 cards make 2 sheets', () => {
  const html = cardSheetHtml(Array.from({ length: 11 }, (_, i) => card(i + 1)), TEXTS);
  assert.equal(html.match(/class="ms-sheet"/g).length, 2);
  assert.equal(html.match(/class="ms-card"/g).length, 11);
  assert.ok(html.includes('Student &lt;1&gt;') && !html.includes('Student <1>'), 'names are escaped');
  assert.ok(html.includes('MS-2026-0011') && html.includes('Abids') && html.includes('Attendance card'));
  assert.equal(html.match(/<svg /g).length, 11, 'one QR per card');
  assert.ok(!/<script/i.test(html), 'no scripts (web Content-Security-Policy)');
});

test('no students: one empty sheet', () => {
  assert.equal(cardSheetHtml([], TEXTS), '<div class="ms-sheet"></div>');
});

test("C5's hint says name or roll number in every language", () => {
  for (const lang of ['en', 'te', 'hi']) {
    const json = JSON.parse(readFileSync(new URL(`../src/i18n/locales/${lang}.json`, import.meta.url), 'utf8'));
    assert.ok(json.attendance.searchHint && json.qrCards.title, lang);
  }
  const en = JSON.parse(readFileSync(new URL('../src/i18n/locales/en.json', import.meta.url), 'utf8'));
  assert.match(en.attendance.searchHint, /roll number/);
  assert.match(en.attendance.scanIntro, /printed QR card/);
});
