// Checks the Edge Function verify-integrity (supabase/functions/verify-integrity) with plain Node and
// no network: the verdict rules on sample verdicts shaped like Google's decodeIntegrityToken answer
// (verdict.ts), the service account's sign-in and the decode call against an imitated Google with a
// made-up key (google.ts), and a whole check against an imitated database (run.ts). The SQL side of
// the same flow is checked in smoke-test.mjs ("0060"); Google and a real phone only on the test day
// (docs/phase3/SPIKE_RESULT.md §8, docs/OPERATIONS.md "Face scan: integrity check").
//
//   cd supabase/tests && npm run test:integrity

import { generateKeyPairSync, verify as verifySignature } from 'node:crypto';

import {
  base64Bytes, checkVerdict, normalizeDigest, readConfig, requestText, sha256Hex, MAX_AGE_MS,
} from '../functions/verify-integrity/verdict.ts';
import {
  DecodeError, SCOPE, TOKEN_URL, decodeUrl, googleDecoder, parseServiceAccount, signedAssertion,
} from '../functions/verify-integrity/google.ts';
import { randomPass, runVerify } from '../functions/verify-integrity/run.ts';

let failures = 0;
let passes = 0;

/** Prints PASS or FAIL for one check. */
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (ok) passes++;
  else failures++;
}

const PACKAGE = 'org.mridangaseva.app';
// The spike's GitHub APK signer (SPIKE_RESULT.md §10): a debug key, fine as a sample.
const CERT_HEX = 'fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c';
const CERT_COLONS = CERT_HEX.toUpperCase().match(/../g).join(':');
const CERT_B64URL = Buffer.from(CERT_HEX, 'hex').toString('base64url');
const CERT_B64 = Buffer.from(CERT_HEX, 'hex').toString('base64');
const LOGIN = '0f8fad5b-d9cb-469f-a165-70867728950e';
const CHALLENGE = '5f2c1e0a9b8d4c3e8a7b6c5d4e3f2a1b';
const ISSUED = 1_760_000_000_000;

// ---------------------------------------------------------------- the request hash and digests
{
  check('the request text is the spike\'s format', requestText(LOGIN, 'check_in', CHALLENGE, 'inside')
    === `mrdg-selfscan-v1|${LOGIN}|check_in|${CHALLENGE}|inside`);
  check('SHA-256 as lower-case hex (FIPS 180-2 "abc")', (await sha256Hex('abc'))
    === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  check('a certificate SHA-256 reads the same from hex, hex with colons, base64 and base64url',
    [CERT_HEX, CERT_COLONS, CERT_B64, CERT_B64URL, ` ${CERT_B64URL} `].every((c) => normalizeDigest(c) === CERT_HEX));
  check('... and anything that is not a SHA-256 is null', [
    '', 'abc', CERT_HEX.slice(2), Buffer.from(CERT_HEX.slice(2), 'hex').toString('base64url'), 'not base64 at all!', `${CERT_HEX}00`,
  ].every((c) => normalizeDigest(c) === null));
  check('base64 with or without padding', base64Bytes('YQ==')?.length === 1 && base64Bytes('YQ')?.length === 1 && base64Bytes('Y') === null);
}

// ---------------------------------------------------------------- configuration
{
  const env = (vars) => (name) => vars[name];
  const ok = readConfig(env({ PLAY_INTEGRITY_CERT_SHA256: `${CERT_COLONS}, ${'ab'.repeat(32)}` }));
  check('config: the class app\'s package by default, two pinned certificates (EAS key + a spare)',
    !('error' in ok) && ok.packageName === PACKAGE && ok.certDigests.length === 2 && ok.certDigests[0] === CERT_HEX && ok.minVersionCode === null,
    JSON.stringify(ok));
  check('config: without a pinned certificate the function is not configured (never "any certificate")',
    'error' in readConfig(env({})) && 'error' in readConfig(env({ PLAY_INTEGRITY_CERT_SHA256: ' , ' })));
  check('config: a value that is not a SHA-256 is refused', 'error' in readConfig(env({ PLAY_INTEGRITY_CERT_SHA256: `${CERT_HEX},deadbeef` })));
  check('config: the package and the oldest build can be set', (() => {
    const c = readConfig(env({ PLAY_INTEGRITY_CERT_SHA256: CERT_HEX, PLAY_INTEGRITY_PACKAGE: 'org.mridangaseva.app.spike', PLAY_INTEGRITY_MIN_VERSION_CODE: '7' }));
    return !('error' in c) && c.packageName === 'org.mridangaseva.app.spike' && c.minVersionCode === 7;
  })());
  check('config: a wrong package or build number is refused', 'error' in readConfig(env({ PLAY_INTEGRITY_CERT_SHA256: CERT_HEX, PLAY_INTEGRITY_PACKAGE: 'not a package' }))
    && 'error' in readConfig(env({ PLAY_INTEGRITY_CERT_SHA256: CERT_HEX, PLAY_INTEGRITY_MIN_VERSION_CODE: 'seven' })));
}

// ---------------------------------------------------------------- the verdict rules
const expectedHash = await sha256Hex(requestText(LOGIN, 'check_in', CHALLENGE, 'inside'));
const config = { packageName: PACKAGE, certDigests: [CERT_HEX], minVersionCode: null };
const input = { ...config, expectedHash, issuedAtMs: ISSUED, nowMs: ISSUED + 9_000 };
/** A verdict as Google decodes it for our link-installed APK on a normal phone (Standard request). */
const sample = (over = {}) => ({
  requestDetails: { requestPackageName: PACKAGE, requestHash: expectedHash, timestampMillis: String(ISSUED + 8_000), ...over.requestDetails },
  appIntegrity: { appRecognitionVerdict: 'UNRECOGNIZED_VERSION', packageName: PACKAGE, certificateSha256Digest: [CERT_B64URL], versionCode: '7', ...over.appIntegrity },
  deviceIntegrity: { deviceRecognitionVerdict: ['MEETS_DEVICE_INTEGRITY'], ...over.deviceIntegrity },
  accountDetails: { appLicensingVerdict: 'UNLICENSED' },
});
{
  const good = checkVerdict(sample(), input);
  check('a link-installed APK (UNRECOGNIZED_VERSION, UNLICENSED) on a normal phone passes every rule',
    good.ok && good.failed === null && good.rules.length === 7 && good.rules.every((r) => r.ok), JSON.stringify(good.rules));
  const fails = (name, verdict, opts = input) => {
    const v = checkVerdict(verdict, opts);
    return v.ok === false && v.failed === name;
  };
  check('request_hash: a token made for another check-in (other challenge)', fails('request_hash', sample({
    requestDetails: { requestHash: 'c'.repeat(64) } })));
  check('request_hash: ... for the same challenge but another location result', fails('request_hash', sample(), {
    ...input, expectedHash: await sha256Hex(requestText(LOGIN, 'check_in', CHALLENGE, 'outside')) }));
  check('request_hash: ... for another login', fails('request_hash', sample(), {
    ...input, expectedHash: await sha256Hex(requestText('11111111-2222-4333-8444-555555555555', 'check_in', CHALLENGE, 'inside')) }));
  check('request_package: requested by another app', fails('request_package', sample({ requestDetails: { requestPackageName: 'com.example.cheat' } })));
  check('request_time: requested more than 60 s after the challenge', fails('request_time', sample({
    requestDetails: { timestampMillis: String(ISSUED + MAX_AGE_MS + 1) } }), { ...input, nowMs: ISSUED + MAX_AGE_MS + 2_000 }));
  check('request_time: requested before the challenge existed (beyond 5 s clock skew)', fails('request_time', sample({
    requestDetails: { timestampMillis: String(ISSUED - 6_000) } })));
  check('request_time: a time in the future', fails('request_time', sample({ requestDetails: { timestampMillis: String(ISSUED + 30_000) } })));
  check('request_time: no time at all', fails('request_time', sample({ requestDetails: { timestampMillis: undefined } })));
  check('request_time: (control) 4 s of clock skew is allowed', checkVerdict(sample({ requestDetails: { timestampMillis: String(ISSUED - 4_000) } }), input).ok);
  check('app_package: UNEVALUATED (no package, no certificate)', fails('app_package', sample({
    appIntegrity: { appRecognitionVerdict: 'UNEVALUATED', packageName: undefined, certificateSha256Digest: undefined } })));
  check('app_package: a re-packaged app under another name', fails('app_package', sample({ appIntegrity: { packageName: 'org.mridangaseva.app.mod' } })));
  check('app_certificate: signed with another key (a rebuilt or patched APK)', fails('app_certificate', sample({
    appIntegrity: { certificateSha256Digest: [Buffer.from('ab'.repeat(32), 'hex').toString('base64url')] } })));
  check('app_certificate: no certificate listed', fails('app_certificate', sample({ appIntegrity: { certificateSha256Digest: [] } })));
  check('app_certificate: (control) any one of two pinned certificates, in Google\'s padded base64 too',
    checkVerdict(sample({ appIntegrity: { certificateSha256Digest: [CERT_B64] } }), { ...input, certDigests: ['ab'.repeat(32), CERT_HEX] }).ok);
  check('app_version: an older build than PLAY_INTEGRITY_MIN_VERSION_CODE', fails('app_version', sample({ appIntegrity: { versionCode: '6' } }), { ...input, minVersionCode: 7 }));
  check('device_integrity: a rooted or hooked phone (empty verdict)', fails('device_integrity', sample({ deviceIntegrity: { deviceRecognitionVerdict: [] } })));
  check('device_integrity: an emulator (MEETS_VIRTUAL_INTEGRITY only)', fails('device_integrity', sample({ deviceIntegrity: { deviceRecognitionVerdict: ['MEETS_VIRTUAL_INTEGRITY'] } })));
  check('device_integrity: basic integrity only (unlocked bootloader)', fails('device_integrity', sample({ deviceIntegrity: { deviceRecognitionVerdict: ['MEETS_BASIC_INTEGRITY'] } })));
  check('device_integrity: (control) device + strong labels pass', checkVerdict(sample({ deviceIntegrity: {
    deviceRecognitionVerdict: ['MEETS_BASIC_INTEGRITY', 'MEETS_DEVICE_INTEGRITY', 'MEETS_STRONG_INTEGRITY'] } }), input).ok);
  check('an empty or missing payload fails, first on the request package', fails('request_package', {}) && fails('request_package', null));
  const many = checkVerdict(sample({ requestDetails: { requestHash: 'x' }, deviceIntegrity: { deviceRecognitionVerdict: [] } }), input);
  check('several failures: the first in rule order is the result, every rule is reported', many.failed === 'request_hash'
    && many.rules.filter((r) => !r.ok).map((r) => r.name).join(',') === 'request_hash,device_integrity');
  check('every result code fits the database\'s shape (^[a-z_]{1,40}$)', good.rules.every((r) => /^[a-z_]{1,40}$/.test(r.name)));
}

// ---------------------------------------------------------------- Google: sign-in and decode
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' },
});
const keyJson = JSON.stringify({ type: 'service_account', client_email: 'integrity-decoder@mridanga-seva.iam.gserviceaccount.com',
  private_key: privateKey, private_key_id: 'made-up' });
{
  const sa = parseServiceAccount(keyJson);
  check('the service account key is read from the secret', sa?.client_email.startsWith('integrity-decoder@') && sa.private_key === privateKey);
  check('a missing or wrong secret is not a key', parseServiceAccount(undefined) === null && parseServiceAccount('{') === null
    && parseServiceAccount(JSON.stringify({ client_email: 'x' })) === null);
  const jwt = await signedAssertion(sa, 1_760_000_000);
  const [h, b, s] = jwt.split('.');
  const claims = JSON.parse(Buffer.from(b, 'base64url').toString());
  check('the sign-in JWT is RS256 for the Play Integrity scope, Google\'s token URL, one hour',
    JSON.parse(Buffer.from(h, 'base64url').toString()).alg === 'RS256' && claims.scope === SCOPE && claims.aud === TOKEN_URL
    && claims.iss === sa.client_email && claims.exp - claims.iat === 3600, JSON.stringify(claims));
  check('... and its signature verifies with the key\'s public half',
    verifySignature('RSA-SHA256', Buffer.from(`${h}.${b}`), publicKey, Buffer.from(s, 'base64url')));

  const calls = [];
  let decodeStatus = 200;
  const fakeGoogle = async (url, init) => {
    calls.push({ url, init });
    if (url === TOKEN_URL) {
      const form = new URLSearchParams(init.body);
      const okForm = form.get('grant_type') === 'urn:ietf:params:oauth:grant-type:jwt-bearer' && form.get('assertion')?.split('.').length === 3;
      return new Response(JSON.stringify(okForm ? { access_token: 'ya29.made-up', expires_in: 3599 } : { error: 'invalid_grant' }), { status: okForm ? 200 : 400 });
    }
    if (url === decodeUrl(PACKAGE)) {
      const body = JSON.parse(init.body);
      const authed = init.headers.Authorization === 'Bearer ya29.made-up';
      if (decodeStatus !== 200 || !authed) return new Response(JSON.stringify({ error: { code: decodeStatus } }), { status: authed ? decodeStatus : 401 });
      return new Response(JSON.stringify({ tokenPayloadExternal: { ...sample(), seen: body.integrity_token } }), { status: 200 });
    }
    return new Response('{}', { status: 404 });
  };
  let clock = 1_760_000_000_000;
  const decode = googleDecoder(fakeGoogle, sa, PACKAGE, () => clock);
  const first = await decode('phone-token-1');
  check('decode: signs in, then posts the token to Play Integrity for our package, and returns tokenPayloadExternal',
    calls.length === 2 && calls[1].url === `https://playintegrity.googleapis.com/v1/${PACKAGE}:decodeIntegrityToken`
    && first.seen === 'phone-token-1' && first.appIntegrity.packageName === PACKAGE);
  await decode('phone-token-2');
  check('decode: the access token is reused within its hour (one sign-in)', calls.filter((c) => c.url === TOKEN_URL).length === 1);
  clock += 3600_000;
  await decode('phone-token-3');
  check('decode: ... and renewed after it', calls.filter((c) => c.url === TOKEN_URL).length === 2);
  decodeStatus = 400;
  let refused = null;
  try { await decode('expired-or-foreign-token'); } catch (e) { refused = e; }
  check('decode: Google\'s refusal (a foreign or reused token) is a DecodeError', refused instanceof DecodeError, String(refused));
  const noSignIn = googleDecoder(async () => new Response('{}', { status: 401 }), sa, PACKAGE);
  let signInFailed = null;
  try { await noSignIn('t'); } catch (e) { signInFailed = e; }
  check('decode: a failed sign-in (key deleted in Google Cloud) is a DecodeError too', signInFailed instanceof DecodeError);
}

// ---------------------------------------------------------------- a whole check (run.ts)
{
  const PASS = 'one-time-pass-AbCdEfGhIjKlMnOpQrStUvWxYz0123456';
  /** An imitated database: begin answers as told, finish records what it got. */
  const fakeDb = (beginAnswer = { ok: true, student_id: 'stu', issued_at_ms: ISSUED }, finishAnswer = { ok: true, pass_expires_at: '2026-10-21T10:02:00Z' }) => {
    const log = [];
    return {
      log,
      rpc: async (name, args) => {
        log.push({ name, args });
        if (name === 'begin_integrity_check') return beginAnswer instanceof Error ? { data: null, error: { message: beginAnswer.message } } : { data: beginAnswer, error: null };
        if (name === 'finish_integrity_check') return { data: finishAnswer, error: null };
        return { data: null, error: { message: 'unknown' } };
      },
    };
  };
  const lines = [];
  const deps = (db, decode = async () => sample()) => ({ rpc: db.rpc, decode, config, now: () => ISSUED + 9_000, newPass: () => PASS, log: (l) => lines.push(l) });
  const body = { challenge: CHALLENGE, token: 'phone-token', action: 'check_in', location: 'inside' };

  const db1 = fakeDb();
  const r1 = await runVerify({ profileId: LOGIN, body }, deps(db1));
  const fin1 = db1.log.find((c) => c.name === 'finish_integrity_check');
  check('run: a good verdict spends the challenge, records pass with the pass\'s SHA-256, and gives the phone the pass',
    r1.status === 200 && r1.body.ok === true && r1.body.pass === PASS && fin1.args.p_result === 'pass'
    && fin1.args.p_pass_hash === await sha256Hex(PASS) && db1.log[0].name === 'begin_integrity_check'
    && db1.log[0].args.p_profile === LOGIN && db1.log[0].args.p_location === 'inside', JSON.stringify(r1));

  for (const [what, bad] of [['no challenge', { ...body, challenge: undefined }], ['a challenge not in the server\'s shape', { ...body, challenge: 'ABC' }],
    ['another action', { ...body, action: 'enrol' }], ['coordinates instead of a location result', { ...body, location: '17.39,78.47' }],
    ['no token', { ...body, token: '' }], ['not JSON', null]]) {
    const db = fakeDb();
    const r = await runVerify({ profileId: LOGIN, body: bad }, deps(db));
    check(`run: ${what} is a bad request and spends nothing`, r.status === 400 && r.body.reason === 'bad_request' && db.log.length === 0);
  }

  const db2 = fakeDb({ ok: false, reason: 'challenge_used' });
  const r2 = await runVerify({ profileId: LOGIN, body }, deps(db2));
  check('run: a refused challenge (used, expired, another login\'s) answers its reason; Google is not asked',
    r2.body.ok === false && r2.body.reason === 'challenge_used' && db2.log.length === 1);

  const db3 = fakeDb();
  const r3 = await runVerify({ profileId: LOGIN, body }, deps(db3, async () => sample({ deviceIntegrity: { deviceRecognitionVerdict: [] } })));
  check('run: a failed verdict is recorded with its rule; no pass', r3.body.ok === false && r3.body.reason === 'integrity_failed'
    && r3.body.rule === 'device_integrity' && db3.log[1].args.p_result === 'device_integrity' && db3.log[1].args.p_pass_hash === null && !('pass' in r3.body));

  const db4 = fakeDb();
  const r4 = await runVerify({ profileId: LOGIN, body }, deps(db4, async () => { throw new DecodeError('decode 400'); }));
  check('run: Google refusing the token is recorded as decode_failed', r4.body.rule === 'decode_failed' && db4.log[1].args.p_result === 'decode_failed');

  const db5 = fakeDb();
  const r5 = await runVerify({ profileId: '11111111-2222-4333-8444-555555555555', body }, deps(db5));
  check('run: a token made for one login does not pass for another (requestHash)', r5.body.rule === 'request_hash');

  const db6 = fakeDb(undefined, { ok: false, reason: 'challenge_expired' });
  const r6 = await runVerify({ profileId: LOGIN, body }, deps(db6));
  check('run: when the database says the verdict came too late, the pass is not given', r6.body.ok === false && r6.body.reason === 'challenge_expired' && !('pass' in r6.body));

  const r7 = await runVerify({ profileId: LOGIN, body }, deps(fakeDb(new Error('connection reset'))));
  check('run: a database error is a server error', r7.status === 500 && r7.body.reason === 'server_error');

  const all = lines.join('\n');
  check('run: the log has result codes only: no token, pass, login or location result',
    lines.length > 0 && !all.includes('phone-token') && !all.includes(PASS) && !all.includes(LOGIN) && !all.includes('inside'), `${lines.length} lines`);

  const made = new Set(Array.from({ length: 50 }, () => randomPass()));
  check('randomPass: 32 random bytes as base64url (43 characters), never repeated', made.size === 50
    && [...made].every((p) => /^[A-Za-z0-9_-]{43}$/.test(p)));
}

console.log(failures ? `\n${failures} check(s) FAILED (${passes}/${passes + failures} passed)` : `\nAll ${passes} integrity checks passed`);
process.exit(failures ? 1 : 0);
