// The rules of the Play Integrity check for one self-scan (Gate 1, audit S4F-01; docs/DECISIONS.md
// #296), ported from the spike's docs/phase3/spike-tools/gate1-server.mjs (branch p3-spike). Pure
// functions, kept apart from Deno so plain Node can test them with sample verdicts
// (supabase/tests/integrity-verdict.test.mjs).
//
// What a verdict must show, all of it:
//   - requestDetails: our package, the requestHash of THIS check-in (login, action, the server's
//     challenge, the location result), requested within the challenge's 60 s;
//   - appIntegrity: our package and our signing certificate (pinned). A link-installed APK gets
//     appRecognitionVerdict UNRECOGNIZED_VERSION, and Google still fills packageName and
//     certificateSha256Digest for it (only UNEVALUATED leaves them out);
//   - deviceIntegrity: MEETS_DEVICE_INTEGRITY (empty on rooted, emulated or hooked phones; the
//     virtual-integrity label of an emulator is not enough).
// Licensing (UNLICENSED off Play) is not used.

/** Must equal the text the app hashes into requestHash (P3-5; the spike's selfScanRequestText). */
export const REQUEST_PREFIX = 'mrdg-selfscan-v1';

export function requestText(login: string, action: string, challenge: string, location: string): string {
  return `${REQUEST_PREFIX}|${login}|${action}|${challenge}|${location}`;
}

/** SHA-256 of a text as 64 lower-case hex characters (WebCrypto: the same in Deno and Node). */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Bytes of a base64 or base64url text (padding optional), or null when it is not one. */
export function base64Bytes(text: string): Uint8Array | null {
  const t = text.trim().replace(/-/g, '+').replace(/_/g, '/').replace(/={1,2}$/, '');
  if (!/^[A-Za-z0-9+/]*$/.test(t) || t.length % 4 === 1) return null;
  try {
    const bin = atob(t + '='.repeat((4 - (t.length % 4)) % 4));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/**
 * A certificate's SHA-256 as 64 lower-case hex characters, from hex (with or without colons, as
 * `npx eas-cli credentials` and keytool print it) or base64 / base64url (as Google returns it);
 * null when it is not a SHA-256.
 */
export function normalizeDigest(text: string): string | null {
  const t = String(text ?? '').trim();
  if (/^[0-9a-fA-F]{64}$/.test(t) || /^[0-9a-fA-F]{2}(:[0-9a-fA-F]{2}){31}$/.test(t)) return t.replace(/:/g, '').toLowerCase();
  const bytes = base64Bytes(t);
  if (!bytes || bytes.length !== 32) return null;
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** The parts of Google's decoded token (tokenPayloadExternal) the rules read. */
export interface IntegrityPayload {
  requestDetails?: { requestPackageName?: string; requestHash?: string; timestampMillis?: string | number };
  appIntegrity?: { appRecognitionVerdict?: string; packageName?: string; certificateSha256Digest?: string[]; versionCode?: string | number };
  deviceIntegrity?: { deviceRecognitionVerdict?: string[] };
  accountDetails?: { appLicensingVerdict?: string };
}

export interface VerdictConfig {
  /** Android package of the class app, e.g. org.mridangaseva.app. */
  packageName: string;
  /** Pinned signing-certificate SHA-256s, normalised (normalizeDigest). At least one. */
  certDigests: string[];
  /** Oldest app build accepted (versionCode); null = any. */
  minVersionCode: number | null;
}

export interface VerdictInput extends VerdictConfig {
  /** sha256Hex(requestText(...)) of this check-in. */
  expectedHash: string;
  /** When the server issued the challenge (ms since 1970). */
  issuedAtMs: number;
  /** Now (ms since 1970). */
  nowMs: number;
}

/** The challenge's life; a token requested outside it is refused. */
export const MAX_AGE_MS = 60_000;
/** Allowed difference between Google's clock and ours. */
export const CLOCK_SKEW_MS = 5_000;

export interface Rule { name: string; ok: boolean; detail: string }
/** ok, or the first rule that failed (its name is the result code the database counts). */
export interface Verdict { ok: boolean; failed: string | null; rules: Rule[] }

/**
 * Checks one decoded verdict. Every rule is evaluated (for the spike-style report); `failed` is the
 * first in this order: request_package, request_hash, request_time, app_package, app_certificate,
 * app_version, device_integrity.
 */
export function checkVerdict(payload: IntegrityPayload | null | undefined, input: VerdictInput): Verdict {
  const p = payload ?? {};
  const rd = p.requestDetails ?? {};
  const ai = p.appIntegrity ?? {};
  const rules: Rule[] = [];
  const rule = (name: string, ok: boolean, detail: unknown) => rules.push({ name, ok: Boolean(ok), detail: String(detail ?? '(missing)') });

  rule('request_package', rd.requestPackageName === input.packageName, rd.requestPackageName);
  rule('request_hash', typeof rd.requestHash === 'string' && rd.requestHash.toLowerCase() === input.expectedHash, rd.requestHash);
  const ts = Number(rd.timestampMillis);
  const age = ts - input.issuedAtMs;
  rule('request_time', Number.isFinite(ts) && age >= -CLOCK_SKEW_MS && age <= MAX_AGE_MS && ts <= input.nowMs + CLOCK_SKEW_MS,
    Number.isFinite(ts) ? `${age} ms after the challenge` : rd.timestampMillis);
  rule('app_package', ai.packageName === input.packageName && ai.appRecognitionVerdict !== 'UNEVALUATED',
    `${ai.appRecognitionVerdict ?? '(no verdict)'} ${ai.packageName ?? '(no package)'}`);
  const digests = (Array.isArray(ai.certificateSha256Digest) ? ai.certificateSha256Digest : []).map(normalizeDigest);
  rule('app_certificate', input.certDigests.length > 0 && digests.some((d) => d !== null && input.certDigests.includes(d)),
    digests.join(',') || '(missing)');
  const version = Number(ai.versionCode);
  rule('app_version', input.minVersionCode === null || (Number.isFinite(version) && version >= input.minVersionCode),
    ai.versionCode);
  const dvRaw = p.deviceIntegrity?.deviceRecognitionVerdict;
  const dv = Array.isArray(dvRaw) ? dvRaw : [];
  rule('device_integrity', dv.includes('MEETS_DEVICE_INTEGRITY'), dv.join(',') || '(empty)');

  const first = rules.find((r) => !r.ok);
  return { ok: !first, failed: first ? first.name : null, rules };
}

/**
 * The function's settings from its environment: PLAY_INTEGRITY_PACKAGE (default the class app),
 * PLAY_INTEGRITY_CERT_SHA256 (one or more, comma- or space-separated; hex with or without colons, or
 * base64), PLAY_INTEGRITY_MIN_VERSION_CODE (optional). Returns { error } when a value is wrong, so
 * the function answers not_configured instead of letting every phone through or none.
 */
export function readConfig(get: (name: string) => string | undefined): VerdictConfig | { error: string } {
  const packageName = (get('PLAY_INTEGRITY_PACKAGE') ?? '').trim() || 'org.mridangaseva.app';
  if (!/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(packageName)) return { error: 'PLAY_INTEGRITY_PACKAGE is not a package name' };
  const raw = (get('PLAY_INTEGRITY_CERT_SHA256') ?? '').split(/[\s,]+/).filter(Boolean);
  if (raw.length === 0) return { error: 'PLAY_INTEGRITY_CERT_SHA256 is not set' };
  const certDigests = raw.map(normalizeDigest);
  if (certDigests.some((d) => d === null)) return { error: 'PLAY_INTEGRITY_CERT_SHA256 holds a value that is not a SHA-256' };
  const minText = (get('PLAY_INTEGRITY_MIN_VERSION_CODE') ?? '').trim();
  const minVersionCode = minText === '' ? null : Number(minText);
  if (minVersionCode !== null && !(Number.isInteger(minVersionCode) && minVersionCode >= 1)) {
    return { error: 'PLAY_INTEGRITY_MIN_VERSION_CODE is not a whole number' };
  }
  return { packageName, certDigests: certDigests as string[], minVersionCode };
}
