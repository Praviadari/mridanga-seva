// Gate 1 of the face spike (audit S4F-01, docs/phase3/SPIKE_RESULT.md §8): plays the SERVER's part of a
// self-scan check-in on the PC, so the spike can show whether a Play Integrity verdict from a LINK-INSTALLED
// APK can be bound to one check-in. P3-6 does the same in an Edge Function. Plain Node, no packages.
//
//   node gate1-server.mjs issue
//       → a single-use challenge, valid 60 s. Type it into the spike app (Phone tab, Gate 1) and tap
//         "Gate 1: Play Integrity for this check-in" within the minute.
//   node gate1-server.mjs check <shared.json> <decoded.json> --cert <signing cert SHA-256>
//       shared.json  = what the app shared ("Share the raw result")
//       decoded.json = Google's decodeIntegrityToken answer for that token (gate1-decode.py in Cloud Shell)
//       --cert       = the APK signing certificate's SHA-256 (hex with or without colons, or base64url),
//                      from `npx eas-cli credentials -p android` (profile spike)
//       → PASS/FAIL per rule; the challenge is spent whatever the result (single use).
//
// State: gate1-state.json next to this script's working directory (challenges and when they were issued).

import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const PACKAGE = 'org.mridangaseva.app.spike';
const MAX_AGE_MS = 60_000;
const STATE = 'gate1-state.json';

const load = () => (existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : { challenges: {} });
const save = (s) => writeFileSync(STATE, JSON.stringify(s, null, 1));

/** Must equal selfScanRequestText() in app/src/spike/phone-checks.tsx. */
const requestText = (code, action, challenge, location) => `mrdg-selfscan-v1|${code}|${action}|${challenge}|${location}`;

function certToBase64Url(cert) {
  const c = cert.trim();
  if (/^[0-9a-fA-F:]{64,95}$/.test(c)) return Buffer.from(c.replace(/:/g, ''), 'hex').toString('base64url');
  return c.replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

const [cmd, ...args] = process.argv.slice(2);

if (cmd === 'issue') {
  const s = load();
  const challenge = randomBytes(8).toString('hex');
  s.challenges[challenge] = { issuedAt: Date.now(), used: false };
  save(s);
  console.log(`challenge: ${challenge}   (valid until ${new Date(Date.now() + MAX_AGE_MS).toLocaleTimeString()})`);
} else if (cmd === 'check') {
  const [sharedPath, decodedPath] = args;
  const certIdx = args.indexOf('--cert');
  if (!sharedPath || !decodedPath || certIdx < 0) {
    console.error('usage: node gate1-server.mjs check <shared.json> <decoded.json> --cert <sha256>');
    process.exit(2);
  }
  const pinned = certToBase64Url(args[certIdx + 1]);
  const shared = JSON.parse(readFileSync(sharedPath, 'utf8'));
  const decodedFile = JSON.parse(readFileSync(decodedPath, 'utf8'));
  const p = decodedFile.tokenPayloadExternal ?? decodedFile;
  const s = load();
  const entry = s.challenges[shared.challenge];
  const rules = [];
  const rule = (name, ok, detail) => rules.push({ name, ok: Boolean(ok), detail });

  rule('challenge was issued by this server', entry, shared.challenge);
  rule('challenge not used before (single use)', entry && !entry.used, entry?.used ? 'already spent' : 'fresh');
  const ts = Number(p.requestDetails?.timestampMillis);
  const age = entry ? ts - entry.issuedAt : NaN;
  rule(`token requested within ${MAX_AGE_MS / 1000} s of the challenge`, age >= -5000 && age <= MAX_AGE_MS, `${age} ms`);
  const expected = createHash('sha256').update(requestText(shared.code, 'checkin', shared.challenge, 'inside')).digest('hex');
  rule('requestHash = hash(login, action, challenge, location result)', p.requestDetails?.requestHash === expected, p.requestDetails?.requestHash);
  rule('requestPackageName is the app', p.requestDetails?.requestPackageName === PACKAGE, p.requestDetails?.requestPackageName);
  const ai = p.appIntegrity ?? {};
  rule('appIntegrity.packageName is the app (not UNEVALUATED)', ai.packageName === PACKAGE, `${ai.appRecognitionVerdict} ${ai.packageName ?? '(missing)'}`);
  const digests = ai.certificateSha256Digest ?? [];
  rule('signing certificate = the pinned one', digests.map((d) => d.replace(/=+$/, '')).includes(pinned), digests.join(',') || '(missing)');
  const dv = p.deviceIntegrity?.deviceRecognitionVerdict ?? [];
  rule('device verdict MEETS_DEVICE_INTEGRITY', dv.includes('MEETS_DEVICE_INTEGRITY'), dv.join(',') || '(empty)');

  if (entry) {
    entry.used = true;
    save(s);
  }
  for (const r of rules) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}  [${r.detail}]`);
  console.log(`info  appRecognitionVerdict ${ai.appRecognitionVerdict}; licensing ${p.accountDetails?.appLicensingVerdict}; versionCode ${ai.versionCode}`);
  const allOk = rules.every((r) => r.ok);
  console.log(allOk ? 'GATE 1 CHECK: PASS' : 'GATE 1 CHECK: FAIL');
  process.exit(allOk ? 0 : 1);
} else {
  console.error('usage: node gate1-server.mjs issue | check <shared.json> <decoded.json> --cert <sha256>');
  process.exit(2);
}
