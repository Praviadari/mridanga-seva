// Unit tests for src/lib/privacy-notice.ts: the website's privacy notice in the reader's language
// (audit D4-01, docs/DECISIONS.md #150). The paths follow website/src/build.mjs pagePath(): English
// at the root, every other language under /<code>/.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { privacyNoticeUrl, WEBSITE_ORIGIN, PRIVACY_NOTICE_VERSION } = await import('../src/lib/privacy-notice.ts');

test('English is at the root, Telugu and Hindi under their code', () => {
  assert.equal(privacyNoticeUrl('en'), `${WEBSITE_ORIGIN}/privacy/`);
  assert.equal(privacyNoticeUrl('te'), `${WEBSITE_ORIGIN}/te/privacy/`);
  assert.equal(privacyNoticeUrl('hi'), `${WEBSITE_ORIGIN}/hi/privacy/`);
});

test('a regional tag uses its language; a language the site lacks gets English', () => {
  assert.equal(privacyNoticeUrl('hi-IN'), `${WEBSITE_ORIGIN}/hi/privacy/`);
  assert.equal(privacyNoticeUrl('ta'), `${WEBSITE_ORIGIN}/privacy/`);
  assert.equal(privacyNoticeUrl(''), `${WEBSITE_ORIGIN}/privacy/`);
});

test('the origin is https without a trailing slash, and the version fits consents.notice_version', () => {
  assert.match(WEBSITE_ORIGIN, /^https:\/\/[^/]+$/);
  assert.match(PRIVACY_NOTICE_VERSION, /^[A-Za-z0-9][A-Za-z0-9._-]{0,19}$/); // the check in 0034
});
