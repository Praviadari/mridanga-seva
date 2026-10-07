// Unit tests for src/lib/asset-link.ts: the link printed on an asset label and reading it back from
// a scan (docs/DECISIONS.md #157, #159). react-native is replaced by the stub in tests/stubs/.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import './stubs/register.mjs';

globalThis.__testOS = 'android';
globalThis.window = undefined;
const { ASSET_LINK_ORIGIN, assetLink, assetTokenFromScan } = await import('../src/lib/asset-link.ts');

const TOKEN = 'Ab3_-xYz0123456789AbCd';

test('the label link is the web app + /i/ + the token', () => {
  assert.equal(assetLink(TOKEN, ASSET_LINK_ORIGIN), `https://app.mridangaseva.com/i/${TOKEN}`);
});

test('a scanned label link from our sites gives the token', () => {
  assert.equal(assetTokenFromScan(`https://app.mridangaseva.com/i/${TOKEN}`), TOKEN);
  assert.equal(assetTokenFromScan(` https://APP.mridangaseva.com/i/${TOKEN}/ `), TOKEN, 'host case and a trailing slash');
  assert.equal(assetTokenFromScan(`https://mridanga-seva-test.pages.dev/i/${TOKEN}`), TOKEN, 'the TEST site');
  assert.equal(assetTokenFromScan(`http://localhost:8127/i/${TOKEN}?x=1`), TOKEN, 'a dev server');
  assert.equal(assetTokenFromScan(TOKEN), TOKEN, 'a bare token');
});

test('anything else is not a label', () => {
  assert.equal(assetTokenFromScan(`https://evil.example.com/i/${TOKEN}`), null, 'another site');
  assert.equal(assetTokenFromScan('https://app.mridangaseva.com/i/short'), null, 'not 22 characters');
  assert.equal(assetTokenFromScan(`https://app.mridangaseva.com/staff/i/${TOKEN}`), null, 'another path');
  assert.equal(assetTokenFromScan('MS1:0F8FAD5B-D9CB-469F-A165-70867728950E'), null, "a student's attendance code");
  assert.equal(assetTokenFromScan('upi://pay?pa=x@y'), null, 'a payment code');
});
