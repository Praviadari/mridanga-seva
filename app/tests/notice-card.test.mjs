// Unit tests for privacy notice 1.0 (migration 0060, docs/DECISIONS.md #571-#577): the card's data calls carry the
// notice version and read the database's answers, the strings exist in all three languages, the three homes show
// the card, and the website's notice is version 1.0, final, with only the team's one fact left to fill.
// Run from app/: npm test.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import './stubs/register.mjs';

const card = await import('../src/data/notice-card.ts');
const { PRIVACY_NOTICE_VERSION } = await import('../src/lib/privacy-notice.ts');

const src = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const repo = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const locale = (lang) => JSON.parse(src(`i18n/locales/${lang}.json`));

/** A fake client recording RPC calls; `answers` by name. */
function fakeClient(answers = {}) {
  const calls = [];
  return {
    calls,
    client: {
      rpc: (name, args) => {
        calls.push({ name, args });
        return Promise.resolve(answers[name] ?? { data: null, error: null });
      },
    },
  };
}

test('#577: the question and the answer carry the notice version', async () => {
  const fake = fakeClient({ privacy_notice_ask: { data: 'adult_now', error: null }, accept_privacy_notice: { data: 'accepted', error: null } });
  globalThis.__testSupabase = fake.client;
  assert.equal(await card.fetchNoticeAsk(), 'adult_now');
  assert.equal(await card.answerNotice(), true);
  assert.deepEqual(fake.calls, [
    { name: 'privacy_notice_ask', args: { p_version: PRIVACY_NOTICE_VERSION } },
    { name: 'accept_privacy_notice', args: { p_version: PRIVACY_NOTICE_VERSION } },
  ]);
  delete globalThis.__testSupabase;
});

test('#577: no card before 0060, offline, or for an answer the app does not know; a failed save says so', async () => {
  globalThis.__testSupabase = fakeClient({ privacy_notice_ask: { data: null, error: { code: 'PGRST202', message: 'x' } } }).client;
  assert.equal(await card.fetchNoticeAsk(), null);
  globalThis.__testSupabase = fakeClient({ privacy_notice_ask: { data: 'something_newer', error: null } }).client;
  assert.equal(await card.fetchNoticeAsk(), null);
  globalThis.__testSupabase = fakeClient({ privacy_notice_ask: { data: null, error: null } }).client;
  assert.equal(await card.fetchNoticeAsk(), null);
  globalThis.__testSupabase = fakeClient({ accept_privacy_notice: { data: null, error: { message: 'Failed to fetch' } } }).client;
  assert.equal(await card.answerNotice(), false);
  delete globalThis.__testSupabase;
});

test('the card\'s words in en, te and hi, with the version where it is named', () => {
  const keys = Object.keys(locale('en').noticeCard);
  for (const lang of ['en', 'te', 'hi']) {
    const words = locale(lang).noticeCard;
    assert.deepEqual(Object.keys(words), keys, lang);
    for (const k of ['acceptBody', 'adultBody', 'showBody']) assert.match(words[k], /\{\{version\}\}/, `${lang}.${k}`);
    for (const v of Object.values(words)) assert.doesNotMatch(v, /[ऀ-ॿ][ఀ-౿]|[ఀ-౿][ऀ-ॿ]/);
  }
});

test('the three homes show the card', () => {
  for (const path of ['app/student/(tabs)/index.tsx', 'screens/coordinator-home.tsx', 'screens/guru-home.tsx']) {
    assert.match(src(path), /<PrivacyNoticeCard \/>/, path);
  }
  const component = src('components/privacy-notice-card.tsx');
  assert.match(component, /ask !== 'show' \? \(\s*<Checkbox/, 'an adult ticks; a child only says Done');
});

test('#571: notice 1.0 on the website and in the app, final, no team fact left', () => {
  assert.equal(PRIVACY_NOTICE_VERSION, '1.0');
  assert.match(repo('website/site.config.mjs'), /privacyNotice: \{ version: '1\.0',/);
  assert.match(repo('website/src/site.mjs'), /\{ id: 'privacy', slug: 'privacy', file: 'privacy\.html', final: true \}/);
  for (const lang of ['en', 'te', 'hi']) {
    const page = repo(`website/content/${lang}/privacy.html`).replace(/<!--[\s\S]*?-->/g, '');
    const blanks = [...page.matchAll(/\[\[TEAM:[^\]]*\]\]/g)];
    assert.equal(blanks.length, 0, `${lang}: no [[TEAM]] blank left`);
    assert.match(page, /Cloudflare Email Routing/, `${lang}: the team's mail processor`);
  }
});
