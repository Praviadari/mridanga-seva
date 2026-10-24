// The TOTP helper against RFC 6238's SHA-1 test vectors (secret "12345678901234567890").
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseEnv, setEnvValue } from './lib/env.mjs';
import { base32Bytes, totp } from './lib/totp.mjs';

const SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'; // base32 of the ASCII "12345678901234567890"

test('base32 decodes the RFC secret', () => {
  assert.equal(base32Bytes(SECRET).toString('ascii'), '12345678901234567890');
  assert.equal(base32Bytes('gezd gnbv-gy3t qojq gezd gnbv gy3t qojq').toString('ascii'), '12345678901234567890');
});

test('RFC 6238 SHA-1 vectors (last 6 digits)', () => {
  assert.equal(totp(SECRET, 59_000, 30, 8), '94287082');
  assert.equal(totp(SECRET, 1_111_111_109_000, 30, 8), '07081804');
  assert.equal(totp(SECRET, 2_000_000_000_000, 30, 8), '69279037');
  assert.equal(totp(SECRET, 59_000), '287082');
});

test('env lines: parse and replace one value', () => {
  const text = '# logins\nE2E_A=one\nE2E_B="two"\n';
  assert.deepEqual(parseEnv(text), { E2E_A: 'one', E2E_B: 'two' });
  assert.equal(setEnvValue(text, 'E2E_A', 'x'), '# logins\nE2E_A=x\nE2E_B="two"\n');
  assert.equal(setEnvValue(text, 'E2E_C', 'y'), '# logins\nE2E_A=one\nE2E_B="two"\nE2E_C=y\n');
});
