// Checks of the translation files (audit D8-22, D8-14): English, Telugu and Hindi have the same
// keys both ways, the same {{placeholders}} in each string, whole plural families, every key the
// code names literally, and the limits written into error texts match the constants the code
// checks. tsc only catches a key Telugu or Hindi lacks; these catch the rest. Run from app/: npm test.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const app = path.resolve(import.meta.dirname, '..');
const load = (lang) => JSON.parse(fs.readFileSync(path.join(app, 'src/i18n/locales', `${lang}.json`), 'utf8'));
const files = { en: load('en'), te: load('te'), hi: load('hi') };

/** Every string as 'a.b.c' → text. */
function flatten(obj, prefix = '', out = new Map()) {
  for (const [key, value] of Object.entries(obj)) {
    const name = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object') flatten(value, name, out);
    else out.set(name, value);
  }
  return out;
}
const flat = Object.fromEntries(Object.entries(files).map(([lang, json]) => [lang, flatten(json)]));
const placeholders = (text) => [...String(text).matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((m) => m[1]).sort();

test('Telugu and Hindi have exactly the English keys', () => {
  for (const lang of ['te', 'hi']) {
    const missing = [...flat.en.keys()].filter((k) => !flat[lang].has(k));
    const extra = [...flat[lang].keys()].filter((k) => !flat.en.has(k));
    assert.deepEqual({ missing, extra }, { missing: [], extra: [] }, lang);
  }
});

test('each string has the same {{placeholders}} in every language', () => {
  const wrong = [];
  for (const [key, text] of flat.en) {
    for (const lang of ['te', 'hi']) {
      if (!flat[lang].has(key)) continue;
      const a = placeholders(text).join(',');
      const b = placeholders(flat[lang].get(key)).join(',');
      if (a !== b) wrong.push(`${lang} ${key}: {${a}} vs {${b}}`);
    }
  }
  assert.deepEqual(wrong, []);
});

test('plural keys come as whole families with {{count}}', () => {
  const wrong = [];
  for (const key of flat.en.keys()) {
    const m = /^(.*)_(one|other)$/.exec(key);
    if (!m) continue;
    const twin = `${m[1]}_${m[2] === 'one' ? 'other' : 'one'}`;
    if (!flat.en.has(twin)) wrong.push(`${key} without ${twin}`);
    if (flat.en.has(m[1])) wrong.push(`${m[1]} is both a plural family and a plain key`);
  }
  assert.deepEqual(wrong, []);
});

/** Every file under src/ with code. */
function sourceFiles(dir = path.join(app, 'src')) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts') ? [full] : [];
  });
}

test("every key the code names literally exists in English (or as a plural family)", () => {
  const missing = new Set();
  for (const file of sourceFiles()) {
    const text = fs.readFileSync(file, 'utf8');
    // t('a.b'), t("a.b"), and keys passed around as 'section.key' strings are not all found here;
    // only the direct t('...') calls with a fixed key.
    for (const m of text.matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)) {
      const key = m[1];
      if (!key.includes('.')) continue;
      if (flat.en.has(key) || flat.en.has(`${key}_one`)) continue;
      missing.add(`${path.relative(app, file)}: ${key}`);
    }
  }
  assert.deepEqual([...missing], []);
});

/** The number a constant is set to in a source file, e.g. TITLE_MAX_LENGTH = 120. */
function constant(file, name) {
  const text = fs.readFileSync(path.join(app, file), 'utf8');
  const m = new RegExp(`\\b${name}\\s*=\\s*(\\d+)`).exec(text);
  assert.ok(m, `${name} not found in ${file}`);
  return m[1];
}

test('limits written into the texts match the limits the code checks', () => {
  const limits = [
    ['src/data/announcements.ts', 'TITLE_MAX_LENGTH', ['announcements.errors.titleTooLong']],
    ['src/data/announcements.ts', 'BODY_MAX_LENGTH', ['announcements.errors.bodyTooLong']],
    ['src/data/announcements.ts', 'REPLY_MAX_LENGTH', ['announcements.errors.replyTooLong']],
    ['src/data/groups.ts', 'GROUP_NAME_MAX_LENGTH', ['groups.errors.nameTooLong']],
    ['src/data/groups.ts', 'GROUP_PURPOSE_MAX_LENGTH', ['groups.errors.purposeTooLong']],
    ['src/data/syllabus.ts', 'REMARK_MAX_LENGTH', ['syllabus.errors.remarkTooLong']],
    ['src/auth/auth-actions.ts', 'MIN_PASSWORD_LENGTH', ['signUp.passwordHint', 'validation.passwordTooShort']],
  ];
  const wrong = [];
  for (const [file, name, keys] of limits) {
    const value = constant(file, name);
    for (const key of keys) {
      for (const lang of ['en', 'te', 'hi']) {
        const text = flat[lang].get(key);
        if (!text || !new RegExp(`(^|\\D)${value}(\\D|$)`).test(text)) wrong.push(`${lang} ${key} should say ${value} (${name})`);
      }
    }
  }
  assert.deepEqual(wrong, []);
});
